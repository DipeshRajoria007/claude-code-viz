import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  MemoryDetailResponse,
  MemoryGraphResponse,
} from "../shared/api-types.js";
import { createServer, type Server } from "../src/server/index.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-dir", import.meta.url),
);

let cacheDir: string;
let server: Server;

beforeAll(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "ccv-memroutes-"));
  server = createServer({
    claudeDir: FIXTURE_DIR,
    cacheDir,
    appVersion: "0.0.0-test",
    redact: true,
    webDir: join(cacheDir, "none"),
  });
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

function request(path: string) {
  return server.app.request(path, { headers: { host: "127.0.0.1" } });
}

describe("GET /api/memory", () => {
  it("returns the full graph and project summaries", async () => {
    const response = await request("/api/memory");
    expect(response.status).toBe(200);
    const graph = (await response.json()) as MemoryGraphResponse;
    expect(graph.memories).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
    expect(graph.danglingLinks).toEqual([
      { sourceId: "-home-test-project/project_alpha.md", slug: "missing-slug" },
    ]);
    expect(graph.projects).toHaveLength(2);
    const testProject = graph.projects.find(
      (project) => project.projectDir === "-home-test-project",
    );
    expect(testProject?.orphanIndexEntries).toHaveLength(1);
    // summaries never include raw bodies
    expect(JSON.stringify(graph)).not.toContain("sk-ant-test");
  });
});

describe("GET /api/memory/:project/:file", () => {
  it("returns the detail with body, outgoing links and backlinks", async () => {
    const response = await request(
      "/api/memory/-home-test-project/project_alpha.md",
    );
    expect(response.status).toBe(200);
    const detail = (await response.json()) as MemoryDetailResponse;
    expect(detail.title).toBe("alpha-overview");
    expect(detail.body).toContain("[[beta-feedback]]");
    expect(detail.outgoing).toContainEqual({
      slug: "beta-feedback",
      targetId: "-home-test-project/feedback_beta.md",
    });
    expect(detail.outgoing).toContainEqual({
      slug: "missing-slug",
      targetId: null,
    });
    expect(detail.backlinks).toContainEqual({
      sourceId: "-home-other/other_notes.md",
      title: "other-notes",
      projectDir: "-home-other",
    });
  });

  it("redacts secrets in served bodies", async () => {
    const response = await request("/api/memory/-home-other/other_notes.md");
    const detail = (await response.json()) as MemoryDetailResponse;
    expect(detail.body).toContain("[REDACTED:anthropic-key]");
    expect(detail.body).not.toContain("sk-ant-test12345678");
  });

  it.each([
    "/api/memory/-home-test-project/MEMORY.md",
    "/api/memory/-home-test-project/..%2F22222222-2222-3333-4444-555555555555.jsonl",
    "/api/memory/..%2F..%2Fetc/passwd.md",
    "/api/memory/-home-test-project/.hidden.md",
    "/api/memory/-home-test-project/nope.md",
    "/api/memory/unknown-project/whatever.md",
  ])("404s (never 500s) for %s", async (path) => {
    const response = await request(path);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("memory not found");
  });
});
