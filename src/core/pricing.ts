import { type ModelPricing, PRICING_TABLE } from "./pricing-data.js";
import type { Usage } from "./types.js";

export interface CostResult {
  /** Estimated USD cost, or null when the model isn't in the pricing table. */
  usd: number | null;
  unknownModel: boolean;
}

export function findPricing(
  model: string,
  table: ModelPricing[] = PRICING_TABLE,
): ModelPricing | null {
  return table.find((entry) => model.startsWith(entry.match)) ?? null;
}

export function computeCost(
  usage: Usage,
  model: string,
  table: ModelPricing[] = PRICING_TABLE,
): CostResult {
  const pricing = findPricing(model, table);
  if (pricing === null) return { usd: null, unknownModel: true };
  const usd =
    (usage.input * pricing.inputPerMTok +
      usage.output * pricing.outputPerMTok +
      usage.cacheRead * pricing.cacheReadPerMTok +
      usage.cacheCreate5m * pricing.cacheWrite5mPerMTok +
      usage.cacheCreate1h * pricing.cacheWrite1hPerMTok) /
    1_000_000;
  return { usd, unknownModel: false };
}

export interface UsageMapCost {
  /** Total over the models that could be priced. */
  usd: number;
  /** Models missing from the pricing table (their cost is not included). */
  unpricedModels: string[];
}

export function computeCostForUsageMap(
  usageByModel: Record<string, Usage>,
  table: ModelPricing[] = PRICING_TABLE,
): UsageMapCost {
  let usd = 0;
  const unpricedModels: string[] = [];
  for (const [model, usage] of Object.entries(usageByModel)) {
    const result = computeCost(usage, model, table);
    if (result.usd === null) unpricedModels.push(model);
    else usd += result.usd;
  }
  return { usd, unpricedModels };
}

/**
 * Merge user-supplied pricing overrides (from `--pricing file.json`) ahead
 * of the bundled table so they win prefix matching.
 */
export function mergePricingTables(
  overrides: ModelPricing[],
  base: ModelPricing[] = PRICING_TABLE,
): ModelPricing[] {
  return [...overrides, ...base];
}
