import {
  createReadStream,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ApiMessage } from "../../shared/api-types.js";
import { type NormalizeOptions, normalizeRecord } from "./normalize.js";
import { isRawRecord } from "./types.js";

/**
 * Random access into huge transcript files (60k+ lines) with O(page) memory.
 * On first open, one streaming pass records a byte offset every
 * CHECKPOINT_INTERVAL records; later page reads seek to the nearest
 * checkpoint and scan forward at most CHECKPOINT_INTERVAL lines.
 */
export const CHECKPOINT_INTERVAL = 256;

export interface OffsetIndex {
  mtimeMs: number;
  size: number;
  /** Number of non-empty lines (= record slots) in the file. */
  recordCount: number;
  /** checkpoints[k] = byte offset of record index k * CHECKPOINT_INTERVAL. */
  checkpoints: number[];
}

export interface MessagePage {
  items: ApiMessage[];
  /** Record-index cursor for the next page, or null when exhausted. */
  nextCursor: number | null;
  /** Total record slots in the file (an upper bound on messages). */
  total: number;
}

const memoryCache = new Map<string, OffsetIndex>();
const MEMORY_CACHE_MAX = 64;

function cacheKey(filePath: string, mtimeMs: number, size: number): string {
  return `${filePath}:${mtimeMs}:${size}`;
}

function offsetsPath(cacheDir: string, sessionId: string): string {
  return join(cacheDir, "offsets", `${sessionId}.json`);
}

async function buildOffsets(filePath: string): Promise<OffsetIndex> {
  const stats = statSync(filePath);
  const checkpoints: number[] = [];
  let recordCount = 0;
  let byteOffset = 0;
  let pending: Buffer = Buffer.alloc(0);

  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    pending =
      pending.length === 0
        ? (chunk as Buffer)
        : Buffer.concat([pending, chunk as Buffer]);
    let newlineIndex = pending.indexOf(0x0a);
    while (newlineIndex !== -1) {
      const lineBytes = newlineIndex + 1;
      const isBlank = pending
        .subarray(0, newlineIndex)
        .every((byte) => byte === 0x20 || byte === 0x09 || byte === 0x0d);
      if (!isBlank) {
        if (recordCount % CHECKPOINT_INTERVAL === 0)
          checkpoints.push(byteOffset);
        recordCount++;
      }
      byteOffset += lineBytes;
      pending = pending.subarray(lineBytes);
      newlineIndex = pending.indexOf(0x0a);
    }
  }
  // trailing line without a newline
  if (
    pending.length > 0 &&
    pending.some((byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0d)
  ) {
    if (recordCount % CHECKPOINT_INTERVAL === 0) checkpoints.push(byteOffset);
    recordCount++;
  }

  return { mtimeMs: stats.mtimeMs, size: stats.size, recordCount, checkpoints };
}

/** Get (building and caching if needed) the offset index for a transcript. */
export async function getOffsets(
  filePath: string,
  sessionId: string,
  cacheDir: string,
): Promise<OffsetIndex> {
  const stats = statSync(filePath);
  const key = cacheKey(filePath, stats.mtimeMs, stats.size);
  const fromMemory = memoryCache.get(key);
  if (fromMemory) return fromMemory;

  const diskPath = offsetsPath(cacheDir, sessionId);
  try {
    const fromDisk = JSON.parse(readFileSync(diskPath, "utf8")) as OffsetIndex;
    if (fromDisk.mtimeMs === stats.mtimeMs && fromDisk.size === stats.size) {
      remember(key, fromDisk);
      return fromDisk;
    }
  } catch {
    // missing or corrupt — rebuild below
  }

  const built = await buildOffsets(filePath);
  try {
    mkdirSync(join(cacheDir, "offsets"), { recursive: true });
    const tmp = `${diskPath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(built));
    renameSync(tmp, diskPath);
  } catch {
    // disk cache is best-effort
  }
  remember(key, built);
  return built;
}

function remember(key: string, offsets: OffsetIndex): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, offsets);
}

/**
 * Read one page of conversation messages starting at record index `cursor`.
 * Non-message records inside the window (titles, attachments, …) are
 * skipped, so a page may carry fewer than `limit` items while nextCursor
 * still advances — clients page until nextCursor is null.
 */
export async function readMessagePage(
  filePath: string,
  sessionId: string,
  cacheDir: string,
  cursor: number,
  limit: number,
  normalizeOptions: NormalizeOptions,
): Promise<MessagePage> {
  const offsets = await getOffsets(filePath, sessionId, cacheDir);
  const safeCursor = Math.max(0, cursor);
  if (safeCursor >= offsets.recordCount) {
    return { items: [], nextCursor: null, total: offsets.recordCount };
  }

  const checkpointIndex = Math.floor(safeCursor / CHECKPOINT_INTERVAL);
  const startOffset = offsets.checkpoints[checkpointIndex] ?? 0;
  let recordIndex = checkpointIndex * CHECKPOINT_INTERVAL;
  const end = Math.min(safeCursor + limit, offsets.recordCount);

  const items: ApiMessage[] = [];
  const stream = createReadStream(filePath, {
    start: startOffset,
    encoding: "utf8",
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (recordIndex >= end) break;
      if (line.trim() === "") continue;
      const current = recordIndex;
      recordIndex++;
      if (current < safeCursor) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (!isRawRecord(value)) continue;
        const message = normalizeRecord(value, current, normalizeOptions);
        if (message) items.push(message);
      } catch {
        // malformed line — skip
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  const nextCursor = end < offsets.recordCount ? end : null;
  return { items, nextCursor, total: offsets.recordCount };
}
