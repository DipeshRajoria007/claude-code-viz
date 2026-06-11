import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allAggregates,
  discoverTranscripts,
  scanClaudeDir,
} from "../src/core/scanner.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-dir", import.meta.url),
);

describe("scanner", () => {
  let claudeDir: string;
  let cacheDir: string;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "ccv-claude-"));
    cacheDir = mkdtempSync(join(tmpdir(), "ccv-cache-"));
    cpSync(FIXTURE_DIR, claudeDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  function scan() {
    return scanClaudeDir({ claudeDir, cacheDir, appVersion: "test" });
  }

  it("discovers only .jsonl transcripts under projects/", () => {
    const found = discoverTranscripts(claudeDir);
    expect(found).toHaveLength(3);
    expect(found.map((file) => file.projectDir).sort()).toEqual([
      "-home-other",
      "-home-test-project",
      "-home-test-project",
    ]);
    const first = found.find((file) => file.sessionId.startsWith("11111111"));
    expect(first?.relPath).toBe(
      "projects/-home-test-project/11111111-2222-3333-4444-555555555555.jsonl",
    );
  });

  it("returns no transcripts for a dir without projects/", () => {
    const empty = mkdtempSync(join(tmpdir(), "ccv-empty-"));
    try {
      expect(discoverTranscripts(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("aggregates every transcript on first scan", async () => {
    const result = await scan();
    expect(result.changed).toBe(3);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toBe(0);

    const aggs = allAggregates(result.index);
    expect(aggs).toHaveLength(3);
    const basic = aggs.find((agg) => agg.sessionId.startsWith("11111111"));
    expect(basic?.title).toBe("Fix flaky login test");
    expect(basic?.usageByModel["claude-opus-4-8"]?.input).toBe(1500);
    const malformed = aggs.find((agg) => agg.sessionId.startsWith("22222222"));
    expect(malformed?.counts.parseErrors).toBe(5);
  });

  it("re-parses nothing when nothing changed", async () => {
    await scan();
    const progressTotals: number[] = [];
    const second = await scanClaudeDir({
      claudeDir,
      cacheDir,
      appVersion: "test",
      onProgress: (progress) => progressTotals.push(progress.filesTotal),
    });
    expect(second.changed).toBe(0);
    expect(second.unchanged).toBe(3);
    expect(progressTotals.every((total) => total === 0)).toBe(true);
  });

  it("re-parses only the file that changed", async () => {
    await scan();
    const target = join(
      claudeDir,
      "projects/-home-test-project/11111111-2222-3333-4444-555555555555.jsonl",
    );
    appendFileSync(
      target,
      `${JSON.stringify({
        type: "user",
        uuid: "aaaa0000-0000-0000-0000-00000000000f",
        sessionId: "11111111-2222-3333-4444-555555555555",
        timestamp: "2026-06-01T11:00:00.000Z",
        message: { role: "user", content: "one more thing" },
      })}\n`,
    );
    const second = await scan();
    expect(second.changed).toBe(1);
    expect(second.unchanged).toBe(2);

    const basic = allAggregates(second.index).find((agg) =>
      agg.sessionId.startsWith("11111111"),
    );
    expect(basic?.counts.user).toBe(2);
  });

  it("drops deleted transcripts from the index", async () => {
    await scan();
    rmSync(
      join(
        claudeDir,
        "projects/-home-other/33333333-2222-3333-4444-555555555555.jsonl",
      ),
    );
    const second = await scan();
    expect(second.removed).toBe(1);
    expect(allAggregates(second.index)).toHaveLength(2);
  });

  it("persists the index across scanner runs (warm restart)", async () => {
    const first = await scan();
    // a brand-new scanClaudeDir call with the same cacheDir loads the saved index
    const second = await scan();
    expect(Object.keys(second.index.files).sort()).toEqual(
      Object.keys(first.index.files).sort(),
    );
    expect(second.changed).toBe(0);
  });
});
