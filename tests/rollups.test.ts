import { describe, expect, it } from "vitest";
import { aggregateRecords } from "../src/core/aggregate.js";
import {
  rollupDaily,
  rollupModels,
  rollupProjects,
  rollupTools,
  rollupTotals,
} from "../src/core/rollups.js";
import type { SessionAggregate } from "../src/core/types.js";
import {
  agentNameRecord,
  assistantRecord,
  hookAttachment,
  ok,
  textBlock,
  toolUseBlock,
  usage,
  userRecord,
} from "./helpers/build-record.js";

function sessionA(): SessionAggregate {
  return aggregateRecords("session-a", "-project-one", [
    ok(userRecord("hi", { timestamp: "2026-06-01T10:00:00.000Z" })),
    ok(
      assistantRecord([textBlock("yo"), toolUseBlock("Bash")], {
        timestamp: "2026-06-01T10:00:05.000Z",
        usage: usage({ input_tokens: 1_000_000, output_tokens: 0 }),
      }),
    ),
    ok(hookAttachment("SessionStart:startup", true, 30)),
    ok(agentNameRecord("Explore")),
  ]);
}

function sessionB(): SessionAggregate {
  return aggregateRecords("session-b", "-project-one", [
    ok(userRecord("more", { timestamp: "2026-06-02T09:00:00.000Z" })),
    ok(
      assistantRecord([toolUseBlock("Read"), toolUseBlock("Bash")], {
        model: "claude-sonnet-4-6",
        timestamp: "2026-06-02T09:00:05.000Z",
        usage: usage({ input_tokens: 0, output_tokens: 1_000_000 }),
      }),
    ),
    ok(hookAttachment("SessionStart:startup", false, 10)),
  ]);
}

function sessionC(): SessionAggregate {
  return aggregateRecords("session-c", "-project-two", [
    ok(userRecord("other project", { timestamp: "2026-06-02T12:00:00.000Z" })),
    ok(
      assistantRecord([textBlock("sure")], {
        model: "mystery-model-x",
        timestamp: "2026-06-02T12:00:05.000Z",
        usage: usage({ input_tokens: 50, output_tokens: 50 }),
      }),
    ),
  ]);
}

describe("rollups", () => {
  const aggs = [sessionA(), sessionB(), sessionC()];

  it("rolls up daily activity across sessions with cost", () => {
    const daily = rollupDaily(aggs);
    expect(daily.map((day) => day.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(daily[0]?.sessions).toBe(1);
    expect(daily[0]?.messages).toBe(2);
    expect(daily[0]?.toolCalls).toBe(1);
    // 1M input on opus-4-8 = $5
    expect(daily[0]?.costUsd).toBeCloseTo(5, 5);
    expect(daily[1]?.sessions).toBe(2);
    // 1M output on sonnet-4-6 = $15 (mystery model excluded from cost)
    expect(daily[1]?.costUsd).toBeCloseTo(15, 5);
  });

  it("filters daily rollups by date range", () => {
    const daily = rollupDaily(aggs, undefined, "2026-06-02", "2026-06-02");
    expect(daily.map((day) => day.date)).toEqual(["2026-06-02"]);
  });

  it("rolls up per project sorted by cost", () => {
    const projects = rollupProjects(aggs);
    expect(projects).toHaveLength(2);
    expect(projects[0]?.projectDir).toBe("-project-one");
    expect(projects[0]?.sessions).toBe(2);
    expect(projects[0]?.messages).toBe(4);
    expect(projects[0]?.costUsd).toBeCloseTo(20, 5);
    expect(projects[0]?.lastActive).toBe("2026-06-02T09:00:05.000Z");
    expect(projects[1]?.projectDir).toBe("-project-two");
  });

  it("rolls up per model and reports unpriced models as null cost", () => {
    const models = rollupModels(aggs);
    const mystery = models.find((model) => model.model === "mystery-model-x");
    expect(mystery?.costUsd).toBeNull();
    expect(mystery?.usage.input).toBe(50);
    const opus = models.find((model) => model.model === "claude-opus-4-8");
    expect(opus?.costUsd).toBeCloseTo(5, 5);
  });

  it("rolls up tools, hooks and agents", () => {
    const tools = rollupTools(aggs);
    expect(tools.tools[0]).toEqual({ name: "Bash", count: 2 });
    expect(tools.tools[1]).toEqual({ name: "Read", count: 1 });
    const hook = tools.hooks.find(
      (entry) => entry.name === "SessionStart:startup",
    );
    expect(hook?.success).toBe(1);
    expect(hook?.failure).toBe(1);
    expect(hook?.avgDurationMs).toBe(20);
    expect(tools.agents).toEqual([{ name: "Explore", count: 1 }]);
  });

  it("computes totals and surfaces unpriced models", () => {
    const totals = rollupTotals(aggs);
    expect(totals.sessions).toBe(3);
    expect(totals.messages).toBe(6);
    expect(totals.toolCalls).toBe(3);
    expect(totals.usage.input).toBe(1_000_050);
    expect(totals.costUsd).toBeCloseTo(20, 1);
    expect(totals.unpricedModels).toEqual(["mystery-model-x"]);
  });
});
