import { readFile } from "node:fs/promises";
import { claudePaths } from "./claudeDir.js";

/**
 * Claude Code's own pre-aggregated daily activity (~/.claude/stats-cache.json).
 * Used for an instant heatmap first paint while the real scan runs.
 */
export interface StatsCacheDay {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export async function readStatsCache(
  claudeDir: string,
): Promise<StatsCacheDay[] | null> {
  try {
    const raw = await readFile(claudePaths(claudeDir).statsCache, "utf8");
    const parsed = JSON.parse(raw) as { dailyActivity?: unknown };
    if (!Array.isArray(parsed.dailyActivity)) return null;
    const days: StatsCacheDay[] = [];
    for (const entry of parsed.dailyActivity) {
      if (typeof entry !== "object" || entry === null) continue;
      const day = entry as Record<string, unknown>;
      if (typeof day.date !== "string") continue;
      days.push({
        date: day.date,
        messageCount:
          typeof day.messageCount === "number" ? day.messageCount : 0,
        sessionCount:
          typeof day.sessionCount === "number" ? day.sessionCount : 0,
        toolCallCount:
          typeof day.toolCallCount === "number" ? day.toolCallCount : 0,
      });
    }
    return days;
  } catch {
    return null;
  }
}
