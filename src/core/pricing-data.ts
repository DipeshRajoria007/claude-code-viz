/**
 * USD prices per million tokens, matched by model-id prefix (first match
 * wins, so more specific prefixes must come first). Cache pricing follows
 * the published rules: 5m write = 1.25x input, 1h write = 2x input,
 * read = 0.1x input — stored as explicit numbers so exceptions are possible.
 *
 * Prices change; every entry carries the date it was last verified, and the
 * CLI accepts `--pricing <file>` to override this table without an upgrade.
 */
export interface ModelPricing {
  /** Model-id prefix this entry applies to. */
  match: string;
  displayName: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
  asOf: string;
}

export const PRICING_AS_OF = "2026-06-04";

export const PRICING_TABLE: ModelPricing[] = [
  // Claude Code emits "<synthetic>" for locally generated messages — free.
  {
    match: "<synthetic>",
    displayName: "Synthetic",
    inputPerMTok: 0,
    outputPerMTok: 0,
    cacheWrite5mPerMTok: 0,
    cacheWrite1hPerMTok: 0,
    cacheReadPerMTok: 0,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-fable-5",
    displayName: "Claude Fable 5",
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 1,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-mythos-5",
    displayName: "Claude Mythos 5",
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 1,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10,
    cacheReadPerMTok: 0.5,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10,
    cacheReadPerMTok: 0.5,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10,
    cacheReadPerMTok: 0.5,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10,
    cacheReadPerMTok: 0.5,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-opus-4-1",
    displayName: "Claude Opus 4.1",
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30,
    cacheReadPerMTok: 1.5,
    asOf: PRICING_AS_OF,
  },
  // Matches both the "claude-opus-4-0" alias and dated "claude-opus-4-2025…" ids.
  {
    match: "claude-opus-4",
    displayName: "Claude Opus 4",
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30,
    cacheReadPerMTok: 1.5,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-sonnet-4",
    displayName: "Claude Sonnet 4.x",
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6,
    cacheReadPerMTok: 0.3,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWrite5mPerMTok: 1.25,
    cacheWrite1hPerMTok: 2,
    cacheReadPerMTok: 0.1,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-3-7-sonnet",
    displayName: "Claude Sonnet 3.7",
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6,
    cacheReadPerMTok: 0.3,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-3-5-sonnet",
    displayName: "Claude Sonnet 3.5",
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6,
    cacheReadPerMTok: 0.3,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-3-5-haiku",
    displayName: "Claude Haiku 3.5",
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    cacheWrite5mPerMTok: 1,
    cacheWrite1hPerMTok: 1.6,
    cacheReadPerMTok: 0.08,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-3-haiku",
    displayName: "Claude Haiku 3",
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    cacheWrite5mPerMTok: 0.3125,
    cacheWrite1hPerMTok: 0.5,
    cacheReadPerMTok: 0.025,
    asOf: PRICING_AS_OF,
  },
  {
    match: "claude-3-opus",
    displayName: "Claude Opus 3",
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30,
    cacheReadPerMTok: 1.5,
    asOf: PRICING_AS_OF,
  },
];
