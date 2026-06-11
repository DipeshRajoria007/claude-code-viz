import { describe, expect, it } from "vitest";
import {
  computeCost,
  computeCostForUsageMap,
  findPricing,
  mergePricingTables,
} from "../src/core/pricing.js";
import type { Usage } from "../src/core/types.js";

function usage(overrides: Partial<Usage> = {}): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    ...overrides,
  };
}

describe("pricing", () => {
  it("computes exact cost for a known model", () => {
    // Opus 4.8: $5 in / $25 out per MTok
    const result = computeCost(
      usage({ input: 1_000_000, output: 200_000 }),
      "claude-opus-4-8",
    );
    expect(result.unknownModel).toBe(false);
    expect(result.usd).toBeCloseTo(5 + 0.2 * 25, 10);
  });

  it("prices cache writes at 1.25x (5m) and 2x (1h), reads at 0.1x input", () => {
    const result = computeCost(
      usage({
        cacheCreate5m: 1_000_000,
        cacheCreate1h: 1_000_000,
        cacheRead: 1_000_000,
      }),
      "claude-sonnet-4-6",
    );
    // Sonnet 4.6 input = $3 → 3.75 + 6 + 0.3
    expect(result.usd).toBeCloseTo(3.75 + 6 + 0.3, 10);
  });

  it("matches dated model ids by prefix", () => {
    expect(findPricing("claude-haiku-4-5-20251001")?.displayName).toBe(
      "Claude Haiku 4.5",
    );
    expect(findPricing("claude-opus-4-7")?.inputPerMTok).toBe(5);
    // opus-4-1 must match before the generic opus-4 (15/75) entry
    expect(findPricing("claude-opus-4-1-20250805")?.inputPerMTok).toBe(15);
    expect(findPricing("claude-opus-4-20250514")?.inputPerMTok).toBe(15);
  });

  it("prices synthetic messages at zero", () => {
    const result = computeCost(
      usage({ input: 5_000, output: 5_000 }),
      "<synthetic>",
    );
    expect(result.usd).toBe(0);
  });

  it("returns null cost for unknown models", () => {
    const result = computeCost(usage({ input: 100 }), "gpt-12-ultra");
    expect(result.usd).toBeNull();
    expect(result.unknownModel).toBe(true);
  });

  it("totals a usage map and surfaces unpriced models", () => {
    const result = computeCostForUsageMap({
      "claude-opus-4-8": usage({ input: 1_000_000 }),
      "mystery-model": usage({ input: 999 }),
    });
    expect(result.usd).toBeCloseTo(5, 10);
    expect(result.unpricedModels).toEqual(["mystery-model"]);
  });

  it("lets user overrides win prefix matching", () => {
    const table = mergePricingTables([
      {
        match: "claude-opus-4-8",
        displayName: "Discounted Opus",
        inputPerMTok: 1,
        outputPerMTok: 2,
        cacheWrite5mPerMTok: 1.25,
        cacheWrite1hPerMTok: 2,
        cacheReadPerMTok: 0.1,
        asOf: "2026-01-01",
      },
    ]);
    expect(findPricing("claude-opus-4-8", table)?.displayName).toBe(
      "Discounted Opus",
    );
    // other models still resolve through the bundled table
    expect(findPricing("claude-haiku-4-5", table)?.inputPerMTok).toBe(1);
  });
});
