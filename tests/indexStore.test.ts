import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAggregate } from "../src/core/aggregate.js";
import {
  createEmptyIndex,
  INDEX_SCHEMA_VERSION,
  loadIndex,
  saveIndex,
} from "../src/core/indexStore.js";

describe("indexStore", () => {
  let cacheDir: string;
  const claudeDir = "/home/test/.claude";

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "ccv-index-"));
  });
  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("round-trips an index through save and load", () => {
    const index = createEmptyIndex(claudeDir, "0.0.0");
    index.files["projects/-p/abc.jsonl"] = {
      mtimeMs: 123,
      size: 456,
      agg: createAggregate("abc", "-p"),
    };
    saveIndex(cacheDir, index);

    const loaded = loadIndex(cacheDir, claudeDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.files["projects/-p/abc.jsonl"]?.size).toBe(456);
    expect(loaded?.files["projects/-p/abc.jsonl"]?.agg.sessionId).toBe("abc");
  });

  it("returns null when no index exists", () => {
    expect(loadIndex(cacheDir, claudeDir)).toBeNull();
  });

  it("invalidates on schema version mismatch", () => {
    const index = createEmptyIndex(claudeDir, "0.0.0");
    saveIndex(cacheDir, index);
    const raw = JSON.parse(readFileSync(join(cacheDir, "index.json"), "utf8"));
    raw.schemaVersion = INDEX_SCHEMA_VERSION + 1;
    writeFileSync(join(cacheDir, "index.json"), JSON.stringify(raw));
    expect(loadIndex(cacheDir, claudeDir)).toBeNull();
  });

  it("invalidates when built for a different claude dir", () => {
    saveIndex(cacheDir, createEmptyIndex("/somewhere/else/.claude", "0.0.0"));
    expect(loadIndex(cacheDir, claudeDir)).toBeNull();
  });

  it("returns null on corrupt json instead of throwing", () => {
    writeFileSync(join(cacheDir, "index.json"), "{not valid json");
    expect(loadIndex(cacheDir, claudeDir)).toBeNull();
  });

  it("saves atomically without leaving temp files behind", () => {
    saveIndex(cacheDir, createEmptyIndex(claudeDir, "0.0.0"));
    expect(existsSync(join(cacheDir, "index.json"))).toBe(true);
    const leftovers = readdirSync(cacheDir).filter((name) =>
      name.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });
});
