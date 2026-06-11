import type { Usage } from "../../shared/api-types.js";

export type { Usage };

/**
 * Raw shapes found in ~/.claude transcript JSONL files. The format is
 * undocumented and changes between Claude Code versions, so every field is
 * optional and records the parser doesn't recognize are preserved as-is
 * (their `type` is counted in SessionAggregate.unknownTypes).
 */

export interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
  [key: string]: unknown;
}

export interface RawContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  [key: string]: unknown;
}

export interface RawMessage {
  id?: string;
  model?: string;
  role?: string;
  content?: string | RawContentBlock[];
  stop_reason?: string | null;
  usage?: RawUsage;
  [key: string]: unknown;
}

export interface RawAttachment {
  type?: string;
  hookName?: string;
  hookEvent?: string;
  exitCode?: number;
  durationMs?: number;
  [key: string]: unknown;
}

export interface RawRecord {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  entrypoint?: string;
  userType?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  requestId?: string;
  message?: RawMessage;
  aiTitle?: string;
  summary?: string;
  leafUuid?: string;
  agentName?: string;
  attachment?: RawAttachment;
  [key: string]: unknown;
}

/** Record types this version of the tool understands. */
export const KNOWN_RECORD_TYPES = new Set([
  "user",
  "assistant",
  "system",
  "attachment",
  "summary",
  "ai-title",
  "agent-name",
  "permission-mode",
  "last-prompt",
  "queue-operation",
  "file-history-snapshot",
  "pr-link",
]);

export function isRawRecord(value: unknown): value is RawRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export interface HookStats {
  success: number;
  failure: number;
  totalDurationMs: number;
}

export interface DailyStats {
  messages: number;
  toolCalls: number;
  usageByModel: Record<string, Usage>;
}

export interface SessionCounts {
  user: number;
  assistant: number;
  toolUse: number;
  toolResultErrors: number;
  sidechain: number;
  parseErrors: number;
  records: number;
}

/**
 * Everything the dashboard needs to know about one session without
 * re-reading its transcript. Persisted in the index cache, so changes
 * here require bumping the index schemaVersion.
 */
export interface SessionAggregate {
  sessionId: string;
  projectDir: string;
  cwd: string | null;
  title: string | null;
  firstTs: string | null;
  lastTs: string | null;
  versions: string[];
  entrypoints: string[];
  gitBranches: string[];
  counts: SessionCounts;
  toolCalls: Record<string, number>;
  agents: Record<string, number>;
  hooks: Record<string, HookStats>;
  usageByModel: Record<string, Usage>;
  daily: Record<string, DailyStats>;
  unknownTypes: Record<string, number>;
}

export function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
  };
}

export function addUsage(target: Usage, delta: Usage): void {
  target.input += delta.input;
  target.output += delta.output;
  target.cacheRead += delta.cacheRead;
  target.cacheCreate5m += delta.cacheCreate5m;
  target.cacheCreate1h += delta.cacheCreate1h;
}

/** Normalize a raw API usage block, splitting cache writes by TTL. */
export function normalizeUsage(raw: RawUsage): Usage {
  const cacheCreation = raw.cache_creation;
  let cacheCreate5m: number;
  let cacheCreate1h: number;
  if (cacheCreation && typeof cacheCreation === "object") {
    cacheCreate5m = cacheCreation.ephemeral_5m_input_tokens ?? 0;
    cacheCreate1h = cacheCreation.ephemeral_1h_input_tokens ?? 0;
  } else {
    // Older records have only the total; 5m is the default TTL.
    cacheCreate5m = raw.cache_creation_input_tokens ?? 0;
    cacheCreate1h = 0;
  }
  return {
    input: raw.input_tokens ?? 0,
    output: raw.output_tokens ?? 0,
    cacheRead: raw.cache_read_input_tokens ?? 0,
    cacheCreate5m,
    cacheCreate1h,
  };
}
