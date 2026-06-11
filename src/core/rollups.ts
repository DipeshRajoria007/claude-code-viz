import { computeCostForUsageMap } from "./pricing.js";
import type { ModelPricing } from "./pricing-data.js";
import {
  addUsage,
  emptyUsage,
  type HookStats,
  type SessionAggregate,
  type Usage,
} from "./types.js";

/**
 * In-memory rollups over the session aggregates in the index. The whole
 * index is a few MB, so these recompute on demand — no extra persistence.
 */

export interface DailyRollup {
  date: string;
  sessions: number;
  messages: number;
  toolCalls: number;
  usage: Usage;
  costUsd: number;
}

export interface ProjectRollup {
  projectDir: string;
  cwd: string | null;
  sessions: number;
  messages: number;
  usage: Usage;
  costUsd: number;
  lastActive: string | null;
}

export interface ModelRollup {
  model: string;
  usage: Usage;
  costUsd: number | null;
}

export interface ToolRollup {
  tools: Array<{ name: string; count: number }>;
  hooks: Array<HookStats & { name: string; avgDurationMs: number }>;
  agents: Array<{ name: string; count: number }>;
}

export interface Totals {
  sessions: number;
  messages: number;
  toolCalls: number;
  usage: Usage;
  costUsd: number;
  unpricedModels: string[];
}

function mergeUsageMaps(
  target: Record<string, Usage>,
  source: Record<string, Usage>,
): void {
  for (const [model, usage] of Object.entries(source)) {
    let entry = target[model];
    if (entry === undefined) {
      entry = emptyUsage();
      target[model] = entry;
    }
    addUsage(entry, usage);
  }
}

function sumUsageMap(usageByModel: Record<string, Usage>): Usage {
  const total = emptyUsage();
  for (const usage of Object.values(usageByModel)) addUsage(total, usage);
  return total;
}

export function rollupDaily(
  aggs: SessionAggregate[],
  table?: ModelPricing[],
  from?: string,
  to?: string,
): DailyRollup[] {
  const byDate = new Map<
    string,
    {
      sessions: number;
      messages: number;
      toolCalls: number;
      usageByModel: Record<string, Usage>;
    }
  >();
  for (const agg of aggs) {
    for (const [date, stats] of Object.entries(agg.daily)) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      let bucket = byDate.get(date);
      if (!bucket) {
        bucket = { sessions: 0, messages: 0, toolCalls: 0, usageByModel: {} };
        byDate.set(date, bucket);
      }
      bucket.sessions++;
      bucket.messages += stats.messages;
      bucket.toolCalls += stats.toolCalls;
      mergeUsageMaps(bucket.usageByModel, stats.usageByModel);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, bucket]) => ({
      date,
      sessions: bucket.sessions,
      messages: bucket.messages,
      toolCalls: bucket.toolCalls,
      usage: sumUsageMap(bucket.usageByModel),
      costUsd: computeCostForUsageMap(bucket.usageByModel, table).usd,
    }));
}

export function rollupProjects(
  aggs: SessionAggregate[],
  table?: ModelPricing[],
): ProjectRollup[] {
  const byProject = new Map<
    string,
    {
      cwd: string | null;
      sessions: number;
      messages: number;
      usageByModel: Record<string, Usage>;
      lastActive: string | null;
    }
  >();
  for (const agg of aggs) {
    let bucket = byProject.get(agg.projectDir);
    if (!bucket) {
      bucket = {
        cwd: null,
        sessions: 0,
        messages: 0,
        usageByModel: {},
        lastActive: null,
      };
      byProject.set(agg.projectDir, bucket);
    }
    bucket.cwd ??= agg.cwd;
    bucket.sessions++;
    bucket.messages += agg.counts.user + agg.counts.assistant;
    mergeUsageMaps(bucket.usageByModel, agg.usageByModel);
    if (
      agg.lastTs &&
      (bucket.lastActive === null || agg.lastTs > bucket.lastActive)
    ) {
      bucket.lastActive = agg.lastTs;
    }
  }
  return [...byProject.entries()]
    .map(([projectDir, bucket]) => ({
      projectDir,
      cwd: bucket.cwd,
      sessions: bucket.sessions,
      messages: bucket.messages,
      usage: sumUsageMap(bucket.usageByModel),
      costUsd: computeCostForUsageMap(bucket.usageByModel, table).usd,
      lastActive: bucket.lastActive,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

export function rollupModels(
  aggs: SessionAggregate[],
  table?: ModelPricing[],
): ModelRollup[] {
  const byModel: Record<string, Usage> = {};
  for (const agg of aggs) mergeUsageMaps(byModel, agg.usageByModel);
  return Object.entries(byModel)
    .map(([model, usage]) => {
      const cost = computeCostForUsageMap({ [model]: usage }, table);
      return {
        model,
        usage,
        costUsd: cost.unpricedModels.length > 0 ? null : cost.usd,
      };
    })
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
}

export function rollupTools(aggs: SessionAggregate[]): ToolRollup {
  const tools = new Map<string, number>();
  const hooks = new Map<string, HookStats>();
  const agents = new Map<string, number>();
  for (const agg of aggs) {
    for (const [name, count] of Object.entries(agg.toolCalls)) {
      tools.set(name, (tools.get(name) ?? 0) + count);
    }
    for (const [name, stats] of Object.entries(agg.hooks)) {
      let entry = hooks.get(name);
      if (!entry) {
        entry = { success: 0, failure: 0, totalDurationMs: 0 };
        hooks.set(name, entry);
      }
      entry.success += stats.success;
      entry.failure += stats.failure;
      entry.totalDurationMs += stats.totalDurationMs;
    }
    for (const [name, count] of Object.entries(agg.agents)) {
      agents.set(name, (agents.get(name) ?? 0) + count);
    }
  }
  return {
    tools: [...tools.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    hooks: [...hooks.entries()]
      .map(([name, stats]) => ({
        name,
        ...stats,
        avgDurationMs:
          stats.success + stats.failure > 0
            ? stats.totalDurationMs / (stats.success + stats.failure)
            : 0,
      }))
      .sort((a, b) => b.success + b.failure - (a.success + a.failure)),
    agents: [...agents.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function rollupTotals(
  aggs: SessionAggregate[],
  table?: ModelPricing[],
): Totals {
  const usageByModel: Record<string, Usage> = {};
  let messages = 0;
  let toolCalls = 0;
  for (const agg of aggs) {
    messages += agg.counts.user + agg.counts.assistant;
    toolCalls += agg.counts.toolUse;
    mergeUsageMaps(usageByModel, agg.usageByModel);
  }
  const cost = computeCostForUsageMap(usageByModel, table);
  return {
    sessions: aggs.length,
    messages,
    toolCalls,
    usage: sumUsageMap(usageByModel),
    costUsd: cost.usd,
    unpricedModels: cost.unpricedModels,
  };
}
