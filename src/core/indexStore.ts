import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionAggregate } from "./types.js";

/** Bump whenever SessionAggregate or IndexFile changes shape — forces a rebuild. */
export const INDEX_SCHEMA_VERSION = 1;

export interface FileEntry {
  mtimeMs: number;
  size: number;
  agg: SessionAggregate;
}

export interface IndexFile {
  schemaVersion: number;
  appVersion: string;
  claudeDir: string;
  generatedAt: string;
  /** Keyed by path relative to the Claude dir, e.g. "projects/<dir>/<uuid>.jsonl". */
  files: Record<string, FileEntry>;
}

export function createEmptyIndex(
  claudeDir: string,
  appVersion: string,
): IndexFile {
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    appVersion,
    claudeDir,
    generatedAt: new Date().toISOString(),
    files: {},
  };
}

function indexPath(cacheDir: string): string {
  return join(cacheDir, "index.json");
}

/**
 * Load the persisted index. Returns null (forcing a full rescan) when the
 * file is missing, unreadable, from another schema version, or built for a
 * different Claude dir.
 */
export function loadIndex(
  cacheDir: string,
  claudeDir: string,
): IndexFile | null {
  let raw: string;
  try {
    raw = readFileSync(indexPath(cacheDir), "utf8");
  } catch {
    return null;
  }
  try {
    const index = JSON.parse(raw) as IndexFile;
    if (index.schemaVersion !== INDEX_SCHEMA_VERSION) return null;
    if (index.claudeDir !== claudeDir) return null;
    if (typeof index.files !== "object" || index.files === null) return null;
    return index;
  } catch {
    return null;
  }
}

/** Atomic save: write to a temp file in the same dir, then rename over. */
export function saveIndex(cacheDir: string, index: IndexFile): void {
  mkdirSync(cacheDir, { recursive: true });
  index.generatedAt = new Date().toISOString();
  const target = indexPath(cacheDir);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(index));
  renameSync(tmp, target);
}
