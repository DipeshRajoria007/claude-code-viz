import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aggregateRecords, createAggregator } from "../src/core/aggregate.js";
import { parseTranscriptStream } from "../src/core/parser.js";
import {
  agentNameRecord,
  aiTitleRecord,
  assistantRecord,
  badLine,
  hookAttachment,
  ok,
  summaryRecord,
  textBlock,
  toolResultBlock,
  toolUseBlock,
  usage,
  userRecord,
} from "./helpers/build-record.js";

const SESSION = "11111111-2222-3333-4444-555555555555";
const PROJECT = "-home-test-project";

describe("aggregate", () => {
  it("counts user and assistant messages, ignoring tool-result-only user records", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("first prompt")),
      ok(assistantRecord([textBlock("answer"), toolUseBlock("Read")])),
      ok(userRecord([toolResultBlock("toolu_1", "file contents")])),
      ok(assistantRecord([textBlock("done")])),
    ]);
    expect(agg.counts.user).toBe(1);
    expect(agg.counts.assistant).toBe(2);
    expect(agg.counts.toolUse).toBe(1);
    expect(agg.toolCalls).toEqual({ Read: 1 });
  });

  it("sums usage by model and dedupes repeated (message.id, requestId) pairs", () => {
    const duplicated = assistantRecord([textBlock("a")], {
      usage: usage({ input_tokens: 1000, output_tokens: 500 }),
    });
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(duplicated),
      ok(duplicated), // exact duplicate line — must not double-count
      ok(
        assistantRecord([textBlock("b")], {
          model: "claude-sonnet-4-6",
          usage: usage({ input_tokens: 10, output_tokens: 20 }),
        }),
      ),
    ]);
    expect(agg.counts.assistant).toBe(3); // records still counted
    expect(agg.usageByModel["claude-opus-4-8"]?.input).toBe(1000);
    expect(agg.usageByModel["claude-opus-4-8"]?.output).toBe(500);
    expect(agg.usageByModel["claude-sonnet-4-6"]?.input).toBe(10);
  });

  it("splits cache-write usage by TTL and falls back to 5m for old records", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(
        assistantRecord([textBlock("a")], {
          usage: usage({
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 50,
            cache_creation: {
              ephemeral_5m_input_tokens: 100,
              ephemeral_1h_input_tokens: 200,
            },
          }),
        }),
      ),
      ok(
        assistantRecord([textBlock("b")], {
          // old-format record without the cache_creation breakdown
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 40,
          },
        }),
      ),
    ]);
    const total = agg.usageByModel["claude-opus-4-8"];
    expect(total?.cacheCreate5m).toBe(140);
    expect(total?.cacheCreate1h).toBe(200);
    expect(total?.cacheRead).toBe(50);
  });

  it("buckets messages and usage by UTC day", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("day one", { timestamp: "2026-06-01T23:59:00.000Z" })),
      ok(
        assistantRecord([toolUseBlock("Bash")], {
          timestamp: "2026-06-02T00:01:00.000Z",
          usage: usage({ input_tokens: 7 }),
        }),
      ),
    ]);
    expect(Object.keys(agg.daily).sort()).toEqual(["2026-06-01", "2026-06-02"]);
    expect(agg.daily["2026-06-01"]?.messages).toBe(1);
    expect(agg.daily["2026-06-02"]?.toolCalls).toBe(1);
    expect(
      agg.daily["2026-06-02"]?.usageByModel["claude-opus-4-8"]?.input,
    ).toBe(7);
    expect(agg.firstTs).toBe("2026-06-01T23:59:00.000Z");
    expect(agg.lastTs).toBe("2026-06-02T00:01:00.000Z");
  });

  it("prefers ai-title over summary over first user prompt", () => {
    const fromPrompt = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("fix the build please")),
    ]);
    expect(fromPrompt.title).toBe("fix the build please");

    const fromSummary = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("fix the build please")),
      ok(summaryRecord("Build fix session")),
    ]);
    expect(fromSummary.title).toBe("Build fix session");

    const fromAiTitle = aggregateRecords(SESSION, PROJECT, [
      ok(summaryRecord("Build fix session")),
      ok(userRecord("fix the build please")),
      ok(aiTitleRecord("Fixing the build")),
    ]);
    expect(fromAiTitle.title).toBe("Fixing the build");
  });

  it("skips harness-injected wrappers when picking a title from prompts", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("<command-name>/review</command-name>")),
      ok(userRecord("real question here")),
    ]);
    expect(agg.title).toBe("real question here");
  });

  it("truncates long titles to 80 chars", () => {
    const long = "x".repeat(300);
    const agg = aggregateRecords(SESSION, PROJECT, [ok(userRecord(long))]);
    expect(agg.title).toHaveLength(80);
    expect(agg.title?.endsWith("…")).toBe(true);
  });

  it("tracks hooks, agents, sidechains, tool-result errors and parse errors", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(hookAttachment("SessionStart:startup", true, 40)),
      ok(hookAttachment("SessionStart:startup", true, 60)),
      ok(hookAttachment("PreToolUse:Bash", false, 10)),
      ok(agentNameRecord("Explore")),
      ok(agentNameRecord("Explore")),
      ok(userRecord([toolResultBlock("toolu_9", "boom", true)])),
      ok(userRecord("side quest", { isSidechain: true })),
      badLine(12),
    ]);
    expect(agg.hooks["SessionStart:startup"]).toEqual({
      success: 2,
      failure: 0,
      totalDurationMs: 100,
    });
    expect(agg.hooks["PreToolUse:Bash"]?.failure).toBe(1);
    expect(agg.agents).toEqual({ Explore: 2 });
    expect(agg.counts.toolResultErrors).toBe(1);
    expect(agg.counts.sidechain).toBe(1);
    expect(agg.counts.parseErrors).toBe(1);
  });

  it("counts unknown record types without failing", async () => {
    const path = fileURLToPath(
      new URL("./fixtures/unknown-types.jsonl", import.meta.url),
    );
    const aggregator = createAggregator(SESSION, PROJECT);
    for await (const line of parseTranscriptStream(path))
      aggregator.apply(line);
    const agg = aggregator.finish();
    expect(agg.unknownTypes).toEqual({
      "hologram-checkpoint": 2,
      "quantum-sync": 1,
    });
    expect(agg.counts.records).toBe(6);
    expect(agg.usageByModel["claude-future-9"]?.input).toBe(20);
  });

  it("collects session metadata (cwd, versions, branches, entrypoints)", () => {
    const agg = aggregateRecords(SESSION, PROJECT, [
      ok(userRecord("hi", { version: "2.1.100", gitBranch: "main" })),
      ok(
        userRecord("hi again", { version: "2.1.101", gitBranch: "feature-x" }),
      ),
    ]);
    expect(agg.cwd).toBe("/home/test/project");
    expect(agg.versions).toEqual(["2.1.100", "2.1.101"]);
    expect(agg.gitBranches).toEqual(["main", "feature-x"]);
    expect(agg.entrypoints).toEqual(["cli"]);
  });
});
