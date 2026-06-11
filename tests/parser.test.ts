import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ParsedLine, parseTranscriptStream } from "../src/core/parser.js";
import type { RawRecord } from "../src/core/types.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

async function collect(path: string): Promise<ParsedLine[]> {
  const results: ParsedLine[] = [];
  for await (const line of parseTranscriptStream(path)) results.push(line);
  return results;
}

function records(lines: ParsedLine[]): RawRecord[] {
  return lines.flatMap((line) => (line.ok ? [line.record] : []));
}

describe("parseTranscriptStream", () => {
  it("parses every record in a well-formed session", async () => {
    const lines = await collect(fixture("basic-session.jsonl"));
    expect(lines).toHaveLength(8);
    expect(lines.every((line) => line.ok)).toBe(true);

    const types = records(lines).map((record) => record.type);
    expect(types).toEqual([
      "summary",
      "user",
      "assistant",
      "user",
      "attachment",
      "assistant",
      "ai-title",
      "last-prompt",
    ]);
  });

  it("preserves message structure and usage fields", async () => {
    const lines = await collect(fixture("basic-session.jsonl"));
    const assistant = records(lines).find(
      (record) => record.type === "assistant",
    );
    expect(assistant?.message?.model).toBe("claude-opus-4-8");
    expect(assistant?.message?.usage?.input_tokens).toBe(1200);
    expect(
      assistant?.message?.usage?.cache_creation?.ephemeral_5m_input_tokens,
    ).toBe(900);
  });

  it("survives malformed lines and keeps parsing afterwards", async () => {
    const lines = await collect(fixture("malformed-lines.jsonl"));
    const good = records(lines);
    const bad = lines.filter((line) => !line.ok);

    // 3 real records; 5 garbage lines (non-JSON, truncated, array, number, no type)
    expect(good).toHaveLength(3);
    expect(bad).toHaveLength(5);
    expect(good.at(-1)?.message?.content).toBe("still works after garbage");
  });

  it("reports the line number of malformed lines", async () => {
    const lines = await collect(fixture("malformed-lines.jsonl"));
    const badLineNumbers = lines.flatMap((line) =>
      line.ok ? [] : [line.lineNumber],
    );
    expect(badLineNumbers).toEqual([2, 4, 5, 6, 7]);
  });

  it("passes unknown record types through without throwing", async () => {
    const lines = await collect(fixture("unknown-types.jsonl"));
    expect(lines.every((line) => line.ok)).toBe(true);
    const types = records(lines).map((record) => record.type);
    expect(types).toContain("hologram-checkpoint");
    expect(types).toContain("quantum-sync");
  });
});
