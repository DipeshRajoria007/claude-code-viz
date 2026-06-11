import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { isRawRecord, type RawRecord } from "./types.js";

export type ParsedLine =
  | { ok: true; record: RawRecord }
  | { ok: false; lineNumber: number };

/** Parse one JSONL line. Returns null for blank lines. */
export function parseLine(line: string): RawRecord | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const value: unknown = JSON.parse(trimmed);
  if (!isRawRecord(value)) throw new Error("not a transcript record");
  return value;
}

/**
 * Stream a transcript file line by line. Malformed lines are reported as
 * `{ok: false}` results instead of throwing — a single bad line (or a
 * future format change) must never lose the rest of the file.
 */
export async function* parseTranscriptStream(
  filePath: string,
): AsyncGenerator<ParsedLine> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (line.trim() === "") continue;
      let record: RawRecord | null;
      try {
        record = parseLine(line);
      } catch {
        yield { ok: false, lineNumber };
        continue;
      }
      if (record !== null) yield { ok: true, record };
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
