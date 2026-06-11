import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { claudePaths } from "./claudeDir.js";

/** One prompt the user typed, from ~/.claude/history.jsonl. */
export interface HistoryEntry {
  display: string;
  /** Unix milliseconds. */
  timestamp: number;
  project: string;
  sessionId: string | null;
}

export async function readHistory(claudeDir: string): Promise<HistoryEntry[]> {
  const path = claudePaths(claudeDir).history;
  const entries: HistoryEntry[] = [];
  let stream: ReturnType<typeof createReadStream>;
  try {
    stream = createReadStream(path, { encoding: "utf8" });
  } catch {
    return entries;
  }
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const value = JSON.parse(line) as {
          display?: unknown;
          timestamp?: unknown;
          project?: unknown;
          sessionId?: unknown;
        };
        if (
          typeof value.display !== "string" ||
          typeof value.timestamp !== "number"
        ) {
          continue;
        }
        entries.push({
          display: value.display,
          timestamp: value.timestamp,
          project: typeof value.project === "string" ? value.project : "",
          sessionId:
            typeof value.sessionId === "string" ? value.sessionId : null,
        });
      } catch {
        // tolerate malformed lines
      }
    }
  } catch {
    // missing file or read error mid-stream — return what we have
  } finally {
    lines.close();
    stream.destroy();
  }
  return entries;
}
