import { Hono } from "hono";
import type { OverviewResponse } from "../../../shared/api-types.js";
import { rollupDaily, rollupTotals } from "../../core/rollups.js";
import { readStatsCache } from "../../core/statsCache.js";
import type { AppState } from "../state.js";

const RECENT_SESSIONS = 10;

export function overviewRoutes(state: AppState): Hono {
  const app = new Hono();
  app.get("/", async (c) => {
    const aggs = state.aggregates();
    const table = state.config.pricingTable;
    const recent = [...aggs]
      .filter((agg) => agg.lastTs !== null)
      .sort((a, b) => ((a.lastTs ?? "") < (b.lastTs ?? "") ? 1 : -1))
      .slice(0, RECENT_SESSIONS);
    const response: OverviewResponse = {
      totals: rollupTotals(aggs, table),
      daily: rollupDaily(aggs, table),
      statsCacheDaily: await readStatsCache(state.config.claudeDir),
      recentSessions: recent.map((agg) => state.summarize(agg)),
    };
    return c.json(response);
  });
  return app;
}
