import { Hono } from "hono";
import type { UsageBucket } from "../../../shared/api-types.js";
import {
  rollupDaily,
  rollupModels,
  rollupProjects,
  rollupTools,
} from "../../core/rollups.js";
import type { Usage } from "../../core/types.js";
import type { AppState } from "../state.js";

function cacheHitRate(usage: Usage): number {
  const denominator =
    usage.cacheRead + usage.input + usage.cacheCreate5m + usage.cacheCreate1h;
  return denominator === 0 ? 0 : usage.cacheRead / denominator;
}

export function analyticsRoutes(state: AppState): Hono {
  const app = new Hono();

  app.get("/usage", (c) => {
    const groupBy = c.req.query("groupBy") ?? "day";
    const from = c.req.query("from");
    const to = c.req.query("to");
    const aggs = state.aggregates();
    const table = state.config.pricingTable;

    let buckets: UsageBucket[];
    if (groupBy === "project") {
      buckets = rollupProjects(aggs, table).map((project) => ({
        key: project.projectDir,
        usage: project.usage,
        costUsd: project.costUsd,
        cacheHitRate: cacheHitRate(project.usage),
      }));
    } else if (groupBy === "model") {
      buckets = rollupModels(aggs, table).map((model) => ({
        key: model.model,
        usage: model.usage,
        costUsd: model.costUsd,
        cacheHitRate: cacheHitRate(model.usage),
      }));
    } else {
      buckets = rollupDaily(aggs, table, from, to).map((day) => ({
        key: day.date,
        usage: day.usage,
        costUsd: day.costUsd,
        cacheHitRate: cacheHitRate(day.usage),
      }));
    }
    return c.json(buckets);
  });

  app.get("/tools", (c) => c.json(rollupTools(state.aggregates())));

  app.get("/models", (c) =>
    c.json(rollupModels(state.aggregates(), state.config.pricingTable)),
  );

  return app;
}

export function projectRoutes(state: AppState): Hono {
  const app = new Hono();
  app.get("/", (c) =>
    c.json(rollupProjects(state.aggregates(), state.config.pricingTable)),
  );
  return app;
}
