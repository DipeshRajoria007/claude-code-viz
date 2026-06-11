import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createAggregator } from "./aggregate.js";
import { claudePaths } from "./claudeDir.js";
import {
  createEmptyIndex,
  type IndexFile,
  loadIndex,
  saveIndex,
} from "./indexStore.js";
import { parseTranscriptStream } from "./parser.js";
import type { SessionAggregate } from "./types.js";

export interface DiscoveredFile {
  /** Path relative to the Claude dir — the index key. */
  relPath: string;
  absPath: string;
  projectDir: string;
  sessionId: string;
  mtimeMs: number;
  size: number;
}

export interface ScanProgress {
  filesTotal: number;
  filesDone: number;
}

export interface ScanOptions {
  claudeDir: string;
  cacheDir: string;
  appVersion: string;
  concurrency?: number;
  checkpointEvery?: number;
  onProgress?: (progress: ScanProgress) => void;
}

export interface ScanResult {
  index: IndexFile;
  changed: number;
  unchanged: number;
  removed: number;
  errors: number;
}

/** Enumerate the .jsonl transcripts under projects/ — the only discovery path. */
export function discoverTranscripts(claudeDir: string): DiscoveredFile[] {
  const projectsDir = claudePaths(claudeDir).projects;
  let projectNames: string[];
  try {
    projectNames = readdirSync(projectsDir);
  } catch {
    return [];
  }
  const discovered: DiscoveredFile[] = [];
  for (const projectName of projectNames) {
    const projectPath = join(projectsDir, projectName);
    let fileNames: string[];
    try {
      fileNames = readdirSync(projectPath);
    } catch {
      continue; // not a directory, or vanished mid-scan
    }
    for (const fileName of fileNames) {
      if (!fileName.endsWith(".jsonl")) continue;
      const absPath = join(projectPath, fileName);
      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(absPath);
      } catch {
        continue;
      }
      if (!stats.isFile()) continue;
      discovered.push({
        relPath: `projects/${projectName}/${fileName}`,
        absPath,
        projectDir: projectName,
        sessionId: basename(fileName, ".jsonl"),
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      });
    }
  }
  return discovered;
}

export async function aggregateTranscript(
  file: DiscoveredFile,
): Promise<SessionAggregate> {
  const aggregator = createAggregator(file.sessionId, file.projectDir);
  for await (const line of parseTranscriptStream(file.absPath)) {
    aggregator.apply(line);
  }
  return aggregator.finish();
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next;
        next++;
        const item = items[index];
        if (item !== undefined) await worker(item);
      }
    },
  );
  await Promise.all(lanes);
}

/**
 * Incremental scan: re-parse only files whose (mtimeMs, size) changed since
 * the last run, drop deleted files, keep everything else from the cache.
 * The index is checkpoint-saved during long scans so a killed first scan
 * resumes where it left off.
 */
export async function scanClaudeDir(options: ScanOptions): Promise<ScanResult> {
  const {
    claudeDir,
    cacheDir,
    appVersion,
    concurrency = 8,
    checkpointEvery = 200,
    onProgress,
  } = options;

  const index =
    loadIndex(cacheDir, claudeDir) ?? createEmptyIndex(claudeDir, appVersion);
  index.appVersion = appVersion;

  const discovered = discoverTranscripts(claudeDir);
  const discoveredKeys = new Set(discovered.map((file) => file.relPath));

  let removed = 0;
  for (const key of Object.keys(index.files)) {
    if (!discoveredKeys.has(key)) {
      delete index.files[key];
      removed++;
    }
  }

  const toParse = discovered.filter((file) => {
    const entry = index.files[file.relPath];
    return (
      entry === undefined ||
      entry.mtimeMs !== file.mtimeMs ||
      entry.size !== file.size
    );
  });
  const unchanged = discovered.length - toParse.length;

  let done = 0;
  let errors = 0;
  let sinceCheckpoint = 0;
  onProgress?.({ filesTotal: toParse.length, filesDone: 0 });

  await mapWithConcurrency(toParse, concurrency, async (file) => {
    try {
      const agg = await aggregateTranscript(file);
      index.files[file.relPath] = {
        mtimeMs: file.mtimeMs,
        size: file.size,
        agg,
      };
    } catch {
      // unreadable file (permissions, vanished mid-read) — skip it
      errors++;
    }
    done++;
    sinceCheckpoint++;
    onProgress?.({ filesTotal: toParse.length, filesDone: done });
    if (sinceCheckpoint >= checkpointEvery) {
      sinceCheckpoint = 0;
      try {
        saveIndex(cacheDir, index);
      } catch {
        // checkpointing is best-effort; the final save below reports failures
      }
    }
  });

  saveIndex(cacheDir, index);
  return {
    index,
    changed: toParse.length - errors,
    unchanged,
    removed,
    errors,
  };
}

/** All session aggregates currently in the index. */
export function allAggregates(index: IndexFile): SessionAggregate[] {
  return Object.values(index.files).map((entry) => entry.agg);
}
