import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalSlug,
  extractWikiLinks,
  isSafeMemorySegment,
  parseFrontmatter,
  parseMemoryIndex,
  readMemoryBody,
  scanMemories,
} from "../src/core/memory.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-dir", import.meta.url),
);

describe("parseFrontmatter", () => {
  it("parses plain top-level fields", () => {
    const { fm, body } = parseFrontmatter(
      "---\nname: my-memory\ntype: project\n---\nbody text\n",
    );
    expect(fm?.fields).toEqual({ name: "my-memory", type: "project" });
    expect(body.trim()).toBe("body text");
  });

  it("splits values at the first colon only and unquotes", () => {
    const { fm } = parseFrontmatter(
      '---\nname: Use bun:sqlite, not better-sqlite3\ndescription: "Alpha — uses bun:sqlite for: everything"\n---\n',
    );
    expect(fm?.fields.name).toBe("Use bun:sqlite, not better-sqlite3");
    expect(fm?.fields.description).toBe(
      "Alpha — uses bun:sqlite for: everything",
    );
  });

  it("parses a nested metadata block (with trailing space after the colon)", () => {
    const { fm } = parseFrontmatter(
      "---\nname: x\nmetadata: \n  node_type: memory\n  type: feedback\n  originSessionId: abc-123\n---\n",
    );
    expect(fm?.metadata).toEqual({
      node_type: "memory",
      type: "feedback",
      originSessionId: "abc-123",
    });
  });

  it("falls back to no-frontmatter when there is no closing fence", () => {
    const text = "---\nname: x\nno closing fence here";
    const { fm, body } = parseFrontmatter(text);
    expect(fm).toBeNull();
    expect(body).toBe(text);
  });

  it("falls back wholesale on a confusing line inside the fence", () => {
    const text = "---\nname: x\nthis line has no colon\n---\nbody";
    const { fm, body } = parseFrontmatter(text);
    expect(fm).toBeNull();
    expect(body).toBe(text);
  });

  it("leaves files starting with a heading untouched", () => {
    const text = "# Plain notes\n\ncontent\n\n---\n\nafter an hr";
    const { fm, body } = parseFrontmatter(text);
    expect(fm).toBeNull();
    expect(body).toBe(text);
  });

  it("handles empty files", () => {
    const { fm, body } = parseFrontmatter("");
    expect(fm).toBeNull();
    expect(body).toBe("");
  });
});

describe("canonicalSlug", () => {
  it.each([
    ["alpha-overview", "alpha-overview"],
    ["Alpha Overview", "alpha-overview"],
    ["feedback_tdd_workflow", "feedback-tdd-workflow"],
    ["  spaced  out  ", "spaced-out"],
    ["weird!!chars##", "weird-chars"],
    ["--leading-and-trailing--", "leading-and-trailing"],
  ])("canonicalSlug(%j) -> %j", (input, expected) => {
    expect(canonicalSlug(input)).toBe(expected);
  });
});

describe("extractWikiLinks", () => {
  it("extracts and dedupes links, ignoring fenced code", () => {
    const body =
      "See [[one]] and [[two]] and [[one]] again.\n```\n[[fenced]]\n```\nAlso [[three]].";
    expect(extractWikiLinks(body)).toEqual(["one", "two", "three"]);
  });
});

describe("parseMemoryIndex", () => {
  it("parses bullets with plain, dot-slash, absolute and encoded targets", () => {
    const entries = parseMemoryIndex(
      [
        "# heading ignored",
        "- [A](a.md) — summary a",
        "- [B](./b.md) - dash summary",
        "* [C](/abs/path/c.md)",
        "- [D](d%20file.md) — encoded",
        "not a bullet",
      ].join("\n"),
    );
    expect(entries).toEqual([
      { title: "A", target: "a.md", summary: "summary a" },
      { title: "B", target: "b.md", summary: "dash summary" },
      { title: "C", target: "c.md", summary: null },
      { title: "D", target: "d file.md", summary: "encoded" },
    ]);
  });
});

describe("scanMemories over fixtures", () => {
  const result = scanMemories(FIXTURE_DIR, { redact: true });
  const { nodes, edges, danglingLinks } = result.graph;

  it("finds all memory files across projects", () => {
    expect(nodes.map((node) => node.id).sort()).toEqual([
      "-home-other/other_notes.md",
      "-home-test-project/feedback_beta.md",
      "-home-test-project/plain_notes.md",
      "-home-test-project/project_alpha.md",
    ]);
  });

  it("parses frontmatter fields, nested metadata and types", () => {
    const alpha = nodes.find((node) => node.fileName === "project_alpha.md");
    expect(alpha?.title).toBe("alpha-overview");
    expect(alpha?.description).toContain("bun:sqlite for: everything");
    expect(alpha?.type).toBe("project");
    const beta = nodes.find((node) => node.fileName === "feedback_beta.md");
    expect(beta?.type).toBe("feedback");
    expect(beta?.originSessionId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("treats no-frontmatter files gracefully", () => {
    const plain = nodes.find((node) => node.fileName === "plain_notes.md");
    expect(plain?.hasFrontmatter).toBe(false);
    expect(plain?.title).toBe("Plain notes"); // from the # heading
    expect(plain?.type).toBe("unknown");
    expect(plain?.slug).toBe("plain-notes"); // stem fallback
  });

  it("builds edges by name and cross-project, skipping fenced links", () => {
    const pairs = edges.map((edge) => `${edge.sourceId} -> ${edge.targetId}`);
    expect(pairs).toContain(
      "-home-test-project/project_alpha.md -> -home-test-project/feedback_beta.md",
    );
    expect(pairs).toContain(
      "-home-test-project/feedback_beta.md -> -home-other/other_notes.md",
    );
    expect(pairs).toContain(
      "-home-other/other_notes.md -> -home-test-project/project_alpha.md",
    );
    expect(pairs).toHaveLength(3);
    expect(edges.some((edge) => edge.slug === "fenced-link")).toBe(false);
  });

  it("reports dangling links", () => {
    expect(danglingLinks).toEqual([
      { sourceId: "-home-test-project/project_alpha.md", slug: "missing-slug" },
    ]);
  });

  it("marks indexed files and reports orphan index entries", () => {
    const alpha = nodes.find((node) => node.fileName === "project_alpha.md");
    expect(alpha?.indexed).toBe(true);
    expect(alpha?.indexSummary).toBe("the alpha system memory");
    const beta = nodes.find((node) => node.fileName === "feedback_beta.md");
    expect(beta?.indexed).toBe(true); // ./ style link
    const plain = nodes.find((node) => node.fileName === "plain_notes.md");
    expect(plain?.indexed).toBe(false);

    const testProject = result.projects.find(
      (project) => project.projectDir === "-home-test-project",
    );
    expect(testProject?.hasIndex).toBe(true);
    expect(testProject?.orphanIndexEntries).toEqual([
      { title: "Ghost entry", target: "deleted.md" },
    ]);
    const other = result.projects.find(
      (project) => project.projectDir === "-home-other",
    );
    expect(other?.hasIndex).toBe(false);
  });

  it("summarizes per-project counts and types", () => {
    const testProject = result.projects.find(
      (project) => project.projectDir === "-home-test-project",
    );
    expect(testProject?.count).toBe(3);
    expect(testProject?.countsByType).toEqual({
      project: 1,
      feedback: 1,
      unknown: 1,
    });
    expect(testProject?.lastModified).not.toBeNull();
    expect(testProject?.totalBytes).toBeGreaterThan(0);
  });
});

describe("isSafeMemorySegment", () => {
  it.each([
    "..",
    ".hidden.md",
    "a/b.md",
    "a\\b.md",
    "",
    ".",
    "a\0b",
  ])("rejects %j", (segment) => {
    expect(isSafeMemorySegment(segment)).toBe(false);
  });
  it.each([
    "project_alpha.md",
    "-home-test-project",
    "notes 2.md",
  ])("accepts %j", (segment) => {
    expect(isSafeMemorySegment(segment)).toBe(true);
  });
});

describe("readMemoryBody", () => {
  const opts = { redact: true };

  it("returns the frontmatter-stripped, redacted body", () => {
    const body = readMemoryBody(
      FIXTURE_DIR,
      "-home-other",
      "other_notes.md",
      opts,
    );
    expect(body).not.toContain("---");
    expect(body).not.toContain("sk-ant-test12345678");
    expect(body).toContain("[REDACTED:anthropic-key]");
    expect(body).toContain("[[alpha-overview]]");
  });

  it("keeps secrets when redaction is off", () => {
    const body = readMemoryBody(FIXTURE_DIR, "-home-other", "other_notes.md", {
      redact: false,
    });
    expect(body).toContain("sk-ant-test12345678");
  });

  it.each([
    ["-home-test-project", "MEMORY.md"],
    ["-home-test-project", "../22222222-2222-3333-4444-555555555555.jsonl"],
    ["..", "anything.md"],
    ["-home-test-project", "project_alpha.txt"],
    ["-home-test-project", ".hidden.md"],
    ["-home-test-project", "missing.md"],
  ])("returns null for %s/%s", (project, file) => {
    expect(readMemoryBody(FIXTURE_DIR, project, file, opts)).toBeNull();
  });
});
