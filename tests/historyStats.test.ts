import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readHistory } from "../src/core/history.js";
import { readStatsCache } from "../src/core/statsCache.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-dir", import.meta.url),
);

describe("readHistory", () => {
  it("parses prompts and tolerates malformed lines", async () => {
    const entries = await readHistory(FIXTURE_DIR);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.display).toBe("fix the flaky login test");
    expect(entries[0]?.timestamp).toBe(1780308000000);
    expect(entries[0]?.sessionId).toContain("11111111");
  });

  it("returns an empty list when history.jsonl is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "ccv-nohistory-"));
    try {
      expect(await readHistory(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("readStatsCache", () => {
  it("parses Claude Code's pre-aggregated daily activity", async () => {
    const days = await readStatsCache(FIXTURE_DIR);
    expect(days).toHaveLength(3);
    expect(days?.[0]).toEqual({
      date: "2026-06-01",
      messageCount: 40,
      sessionCount: 1,
      toolCallCount: 12,
    });
  });

  it("returns null when the file is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "ccv-nostats-"));
    try {
      expect(await readStatsCache(empty)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
