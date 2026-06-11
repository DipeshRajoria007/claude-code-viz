import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type {
  MemoryEdge,
  MemoryProjectSummary,
  MemorySummary,
  MemoryType,
} from "../../shared/api-types.js";
import { claudePaths } from "./claudeDir.js";
import { redactSecrets } from "./redact.js";

/**
 * Claude Code's file-based memory lives at projects/<dir>/memory/*.md with a
 * MEMORY.md index per directory. The format is informal and has drifted over
 * time (frontmatter optional, `type` at the root or nested under `metadata:`,
 * [[wiki-links]] that resolve by frontmatter name OR filename stem), so every
 * parser here is tolerant: on anything confusing it degrades gracefully
 * instead of dropping the file.
 *
 * Total corpus is small (hundreds of KB), so everything rescans per request —
 * always fresh while Claude writes memories. A mtime-keyed memo is the
 * upgrade path if memory dirs ever grow 100x.
 */

export interface ParsedFrontmatter {
  fields: Record<string, string>;
  metadata: Record<string, string>;
}

export interface MemoryFile extends MemorySummary {
  outgoingSlugs: string[];
}

export interface MemoryGraph {
  nodes: MemoryFile[];
  edges: MemoryEdge[];
  danglingLinks: Array<{ sourceId: string; slug: string }>;
}

export interface MemoryScanResult {
  graph: MemoryGraph;
  projects: MemoryProjectSummary[];
}

const MEMORY_TYPES = new Set(["project", "feedback", "reference", "user"]);
const MAX_FRONTMATTER_LINES = 50;

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse the simple YAML subset observed in real memory files: top-level
 * `key: value` pairs plus one optional nested `metadata:` block. Values are
 * split at the FIRST colon only (real values contain colons). Any line the
 * parser doesn't understand makes the whole file fall back to
 * no-frontmatter — the original text becomes the body.
 */
export function parseFrontmatter(text: string): {
  fm: ParsedFrontmatter | null;
  body: string;
} {
  const noFrontmatter = { fm: null, body: text };
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trimEnd() !== "---") return noFrontmatter;

  let closing = -1;
  for (let i = 1; i < Math.min(lines.length, MAX_FRONTMATTER_LINES); i++) {
    if ((lines[i] ?? "").trimEnd() === "---") {
      closing = i;
      break;
    }
  }
  if (closing === -1) return noFrontmatter;

  const fields: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  let inMetadata = false;
  for (let i = 1; i < closing; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const topLevel = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (topLevel?.[1] !== undefined) {
      const key = topLevel[1];
      const value = (topLevel[2] ?? "").trim();
      if (key === "metadata" && value === "") {
        inMetadata = true;
        continue;
      }
      inMetadata = false;
      fields[key] = unquote(value);
      continue;
    }
    const nested = line.match(/^[ \t]+([A-Za-z0-9_-]+):(.*)$/);
    if (nested?.[1] !== undefined && inMetadata) {
      metadata[nested[1]] = unquote((nested[2] ?? "").trim());
      continue;
    }
    return noFrontmatter; // confusing line — treat the whole file as body
  }
  return {
    fm: { fields, metadata },
    body: lines.slice(closing + 1).join("\n"),
  };
}

/** Normalize a name or filename stem into the key used by [[link]] lookup. */
export function canonicalSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract [[wiki-link]] slugs from a body, ignoring fenced code blocks. */
export function extractWikiLinks(body: string): string[] {
  const withoutFences = body.replace(/```[\s\S]*?```/g, "");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of withoutFences.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    const slug = (match[1] ?? "").trim();
    if (slug !== "" && !seen.has(slug)) {
      seen.add(slug);
      result.push(slug);
    }
  }
  return result;
}

export interface MemoryIndexEntry {
  title: string;
  target: string;
  summary: string | null;
}

/** Parse a MEMORY.md index: "- [Title](file.md) — summary" bullets. */
export function parseMemoryIndex(text: string): MemoryIndexEntry[] {
  const entries: MemoryIndexEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^[-*]\s+\[([^\]]*)\]\(([^)]+)\)\s*(?:[—–-]\s*(.*))?$/,
    );
    if (!match) continue;
    let target = (match[2] ?? "").trim();
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep raw target on bad escapes
    }
    const hash = target.indexOf("#");
    if (hash !== -1) target = target.slice(0, hash);
    if (target.startsWith("./")) target = target.slice(2);
    if (target.includes("/"))
      target = target.slice(target.lastIndexOf("/") + 1);
    entries.push({
      title: match[1] ?? "",
      target,
      summary: match[3]?.trim() || null,
    });
  }
  return entries;
}

function normalizeType(value: string | undefined): MemoryType {
  const lowered = value?.trim().toLowerCase();
  return lowered && MEMORY_TYPES.has(lowered)
    ? (lowered as MemoryType)
    : "unknown";
}

function titleFromBody(body: string): string | null {
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^#+\s+(.+)$/);
    if (heading?.[1]) return heading[1].trim();
    if (line.trim() !== "") break;
  }
  return null;
}

function prettifyStem(stem: string): string {
  return stem.replace(/[_-]+/g, " ").trim();
}

/** Path-segment allowlist: no separators, no dotfiles, no traversal. */
export function isSafeMemorySegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    !segment.startsWith(".") &&
    /^[A-Za-z0-9 ._-]+$/.test(segment)
  );
}

function memoryDirPath(claudeDir: string, projectDir: string): string {
  return join(claudePaths(claudeDir).projects, projectDir, "memory");
}

interface RawMemoryRead {
  file: MemoryFile;
  body: string;
}

function readMemoryDir(
  claudeDir: string,
  projectDir: string,
  redact: boolean,
): { reads: RawMemoryRead[]; indexEntries: MemoryIndexEntry[] | null } {
  const dir = memoryDirPath(claudeDir, projectDir);
  let fileNames: string[];
  try {
    fileNames = readdirSync(dir);
  } catch {
    return { reads: [], indexEntries: null };
  }
  const clean = redact ? redactSecrets : (text: string) => text;

  let indexEntries: MemoryIndexEntry[] | null = null;
  const reads: RawMemoryRead[] = [];
  for (const fileName of fileNames.sort()) {
    if (!fileName.endsWith(".md") || !isSafeMemorySegment(fileName)) continue;
    const path = join(dir, fileName);
    let text: string;
    let mtimeMs: number;
    let size: number;
    try {
      const stats = statSync(path);
      if (!stats.isFile()) continue;
      text = readFileSync(path, "utf8");
      mtimeMs = stats.mtimeMs;
      size = stats.size;
    } catch {
      continue;
    }
    if (fileName === "MEMORY.md") {
      indexEntries = parseMemoryIndex(text);
      continue;
    }

    const { fm, body } = parseFrontmatter(text);
    const stem = fileName.replace(/\.md$/, "");
    const name = fm?.fields.name;
    const title = name ?? titleFromBody(body) ?? prettifyStem(stem);
    reads.push({
      file: {
        id: `${projectDir}/${fileName}`,
        projectDir,
        fileName,
        title: clean(title),
        slug: canonicalSlug(name ?? stem),
        description: fm?.fields.description
          ? clean(fm.fields.description)
          : null,
        type: normalizeType(fm?.fields.type ?? fm?.metadata.type),
        originSessionId:
          fm?.metadata.originSessionId ?? fm?.fields.originSessionId ?? null,
        hasFrontmatter: fm !== null,
        indexed: false,
        indexSummary: null,
        sizeBytes: size,
        modifiedAt: new Date(mtimeMs).toISOString(),
        outgoingSlugs: extractWikiLinks(body),
      },
      body,
    });
  }
  return { reads, indexEntries };
}

/** Scan every projects/<dir>/memory directory into a graph + summaries. */
export function scanMemories(
  claudeDir: string,
  options: { redact: boolean },
): MemoryScanResult {
  const projectsDir = claudePaths(claudeDir).projects;
  let projectNames: string[];
  try {
    projectNames = readdirSync(projectsDir).sort();
  } catch {
    projectNames = [];
  }

  const nodes: MemoryFile[] = [];
  const projects: MemoryProjectSummary[] = [];
  const clean = options.redact ? redactSecrets : (text: string) => text;

  for (const projectDir of projectNames) {
    if (!isSafeMemorySegment(projectDir)) continue;
    const { reads, indexEntries } = readMemoryDir(
      claudeDir,
      projectDir,
      options.redact,
    );
    if (reads.length === 0 && indexEntries === null) continue;

    const byLoweredName = new Map(
      reads.map((read) => [read.file.fileName.toLowerCase(), read.file]),
    );
    const orphanIndexEntries: Array<{ title: string; target: string }> = [];
    for (const entry of indexEntries ?? []) {
      const file = byLoweredName.get(entry.target.toLowerCase());
      if (file) {
        file.indexed = true;
        file.indexSummary = entry.summary ? clean(entry.summary) : null;
      } else if (entry.target.toLowerCase() !== "memory.md") {
        orphanIndexEntries.push({ title: entry.title, target: entry.target });
      }
    }

    const countsByType: Partial<Record<MemoryType, number>> = {};
    let totalBytes = 0;
    let lastModified: string | null = null;
    for (const { file } of reads) {
      countsByType[file.type] = (countsByType[file.type] ?? 0) + 1;
      totalBytes += file.sizeBytes;
      if (lastModified === null || file.modifiedAt > lastModified) {
        lastModified = file.modifiedAt;
      }
      nodes.push(file);
    }
    projects.push({
      projectDir,
      count: reads.length,
      countsByType,
      hasIndex: indexEntries !== null,
      orphanIndexEntries,
      lastModified,
      totalBytes,
    });
  }

  return { graph: buildGraph(nodes), projects };
}

function buildGraph(nodes: MemoryFile[]): MemoryGraph {
  // name-claimed slugs first so they win over filename-stem fallbacks
  const bySlug = new Map<string, MemoryFile[]>();
  const register = (slug: string, node: MemoryFile) => {
    if (slug === "") return;
    const list = bySlug.get(slug);
    if (list === undefined) bySlug.set(slug, [node]);
    else if (!list.includes(node)) list.push(node);
  };
  for (const node of nodes) register(node.slug, node);
  for (const node of nodes) {
    register(canonicalSlug(node.fileName.replace(/\.md$/, "")), node);
  }

  const edges: MemoryEdge[] = [];
  const danglingLinks: Array<{ sourceId: string; slug: string }> = [];
  for (const node of nodes) {
    for (const rawSlug of node.outgoingSlugs) {
      const candidates = bySlug.get(canonicalSlug(rawSlug)) ?? [];
      const target =
        candidates.find((c) => c.projectDir === node.projectDir) ??
        [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (target === undefined) {
        danglingLinks.push({ sourceId: node.id, slug: rawSlug });
      } else if (target.id !== node.id) {
        edges.push({ sourceId: node.id, targetId: target.id, slug: rawSlug });
      }
    }
  }
  return { nodes, edges, danglingLinks };
}

/**
 * Read one memory's markdown body (frontmatter stripped, redacted). The only
 * body-read path — both segments are allowlist-validated, only .md files
 * under projects/<dir>/memory are reachable, and the resolved path must stay
 * inside the projects root.
 */
export function readMemoryBody(
  claudeDir: string,
  projectDir: string,
  fileName: string,
  options: { redact: boolean },
): string | null {
  if (!isSafeMemorySegment(projectDir) || !isSafeMemorySegment(fileName)) {
    return null;
  }
  if (!fileName.endsWith(".md") || fileName === "MEMORY.md") return null;
  const projectsDir = claudePaths(claudeDir).projects;
  const path = join(projectsDir, projectDir, "memory", fileName);
  if (!resolve(path).startsWith(resolve(projectsDir) + sep)) return null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const { body } = parseFrontmatter(text);
  return options.redact ? redactSecrets(body) : body;
}
