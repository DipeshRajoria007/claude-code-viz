import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHECKPOINT_INTERVAL,
  getOffsets,
  readMessagePage,
} from "../src/core/sessionReader.js";

const SESSION_ID = "99999999-2222-3333-4444-555555555555";
const RECORD_COUNT = CHECKPOINT_INTERVAL * 2 + 90; // 602 — spans 3 checkpoints

function buildTranscript(records: number): string {
  const lines: string[] = [];
  for (let i = 0; i < records; i++) {
    if (i % 2 === 0) {
      lines.push(
        JSON.stringify({
          type: "user",
          uuid: `uuid-${i}`,
          sessionId: SESSION_ID,
          timestamp: "2026-06-05T10:00:00.000Z",
          message: { role: "user", content: `prompt number ${i}` },
        }),
      );
    } else {
      lines.push(
        JSON.stringify({
          type: "assistant",
          uuid: `uuid-${i}`,
          sessionId: SESSION_ID,
          timestamp: "2026-06-05T10:00:01.000Z",
          message: {
            id: `msg-${i}`,
            role: "assistant",
            model: "claude-opus-4-8",
            content: [{ type: "text", text: `answer number ${i}` }],
            usage: { input_tokens: 5, output_tokens: 5 },
          },
        }),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

describe("sessionReader", () => {
  let dir: string;
  let cacheDir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ccv-reader-"));
    cacheDir = mkdtempSync(join(tmpdir(), "ccv-reader-cache-"));
    filePath = join(dir, `${SESSION_ID}.jsonl`);
    writeFileSync(filePath, buildTranscript(RECORD_COUNT));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("builds sparse checkpoints and counts records", async () => {
    const offsets = await getOffsets(filePath, SESSION_ID, cacheDir);
    expect(offsets.recordCount).toBe(RECORD_COUNT);
    expect(offsets.checkpoints).toHaveLength(3);
    expect(offsets.checkpoints[0]).toBe(0);
  });

  it("persists the offset index to the cache dir", async () => {
    await getOffsets(filePath, SESSION_ID, cacheDir);
    expect(existsSync(join(cacheDir, "offsets", `${SESSION_ID}.json`))).toBe(
      true,
    );
  });

  it("pages through the whole file without gaps or duplicates", async () => {
    const seen: number[] = [];
    let cursor: number | null = 0;
    while (cursor !== null) {
      const page = await readMessagePage(
        filePath,
        SESSION_ID,
        cacheDir,
        cursor,
        100,
        { redact: false },
      );
      seen.push(...page.items.map((item) => item.index));
      expect(page.total).toBe(RECORD_COUNT);
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(RECORD_COUNT);
    expect(new Set(seen).size).toBe(RECORD_COUNT);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(RECORD_COUNT - 1);
  });

  it("seeks into the middle of a file via checkpoints", async () => {
    const start = CHECKPOINT_INTERVAL + 17; // not checkpoint-aligned
    const page = await readMessagePage(
      filePath,
      SESSION_ID,
      cacheDir,
      start,
      5,
      {
        redact: false,
      },
    );
    expect(page.items.map((item) => item.index)).toEqual([
      start,
      start + 1,
      start + 2,
      start + 3,
      start + 4,
    ]);
    expect(page.items[0]?.blocks[0]?.text).toContain(`number ${start}`);
    expect(page.nextCursor).toBe(start + 5);
  });

  it("returns an empty terminal page past the end", async () => {
    const page = await readMessagePage(
      filePath,
      SESSION_ID,
      cacheDir,
      RECORD_COUNT + 50,
      10,
      { redact: false },
    );
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("rebuilds offsets when the file changes", async () => {
    const before = await getOffsets(filePath, SESSION_ID, cacheDir);
    writeFileSync(filePath, buildTranscript(RECORD_COUNT + 10));
    const after = await getOffsets(filePath, SESSION_ID, cacheDir);
    expect(before.recordCount).toBe(RECORD_COUNT);
    expect(after.recordCount).toBe(RECORD_COUNT + 10);
  });

  it("skips malformed lines while keeping record indices stable", async () => {
    writeFileSync(
      filePath,
      `${JSON.stringify({ type: "user", message: { role: "user", content: "first" } })}\nGARBAGE NOT JSON\n${JSON.stringify(
        { type: "user", message: { role: "user", content: "third" } },
      )}\n`,
    );
    const page = await readMessagePage(filePath, SESSION_ID, cacheDir, 0, 10, {
      redact: false,
    });
    expect(page.total).toBe(3);
    // record index 1 is the garbage line — skipped, but indices 0 and 2 kept
    expect(page.items.map((item) => item.index)).toEqual([0, 2]);
  });
});
