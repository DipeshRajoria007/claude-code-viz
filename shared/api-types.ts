/**
 * Shared request/response contracts between the server (src/) and the
 * dashboard (web/). This file must stay dependency-free and runnable in
 * both Node and browser TypeScript projects.
 */

/** Normalized token usage for one assistant message (or a rollup of many). */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}

export type BlockKind =
  | "text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "image"
  | "unknown";

/** One renderable piece of a conversation message. */
export interface MessageBlock {
  kind: BlockKind;
  /** Text content for text/thinking blocks; stringified content for tool_result. */
  text?: string;
  toolName?: string;
  toolUseId?: string;
  /** Tool input as parsed JSON (already redacted server-side). */
  toolInput?: unknown;
  isError?: boolean;
  /** Original block type when kind is "unknown". */
  rawType?: string;
}

// ---------------------------------------------------------------------------
// REST API contracts (/api/*)
// ---------------------------------------------------------------------------

export interface MetaResponse {
  appVersion: string;
  claudeDir: string;
  cacheDir: string;
  pricingAsOf: string;
  redact: boolean;
}

export interface ScanStatusResponse {
  state: "idle" | "scanning";
  filesTotal: number;
  filesDone: number;
  errors: number;
  startedAt: string | null;
  lastCompletedAt: string | null;
}

export interface DailyActivity {
  date: string;
  sessions: number;
  messages: number;
  toolCalls: number;
  usage: Usage;
  costUsd: number;
}

export interface StatsCacheDaily {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface TotalsSummary {
  sessions: number;
  messages: number;
  toolCalls: number;
  usage: Usage;
  costUsd: number;
  unpricedModels: string[];
}

export interface SessionSummary {
  sessionId: string;
  projectDir: string;
  cwd: string | null;
  title: string | null;
  firstTs: string | null;
  lastTs: string | null;
  messages: number;
  toolCalls: number;
  models: string[];
  /** Estimated; null when every model in the session is unpriced. */
  costUsd: number | null;
}

export interface OverviewResponse {
  totals: TotalsSummary;
  daily: DailyActivity[];
  /** Claude Code's own stats cache — first paint while the scan runs. */
  statsCacheDaily: StatsCacheDaily[] | null;
  recentSessions: SessionSummary[];
}

export interface SessionsPageResponse {
  items: SessionSummary[];
  nextCursor: number | null;
  total: number;
}

export interface SessionDetailResponse extends SessionSummary {
  gitBranches: string[];
  versions: string[];
  entrypoints: string[];
  counts: {
    user: number;
    assistant: number;
    toolUse: number;
    toolResultErrors: number;
    sidechain: number;
    parseErrors: number;
    records: number;
  };
  toolCallsByName: Record<string, number>;
  usageByModel: Record<string, Usage>;
  unknownTypes: Record<string, number>;
}

export interface MessagesPageResponse {
  items: ApiMessage[];
  nextCursor: number | null;
  total: number;
}

export interface ProjectSummary {
  projectDir: string;
  cwd: string | null;
  sessions: number;
  messages: number;
  usage: Usage;
  costUsd: number;
  lastActive: string | null;
}

export interface UsageBucket {
  key: string;
  usage: Usage;
  costUsd: number | null;
  cacheHitRate: number;
}

export interface ModelSummary {
  model: string;
  usage: Usage;
  costUsd: number | null;
}

export interface ToolsAnalyticsResponse {
  tools: Array<{ name: string; count: number }>;
  hooks: Array<{
    name: string;
    success: number;
    failure: number;
    totalDurationMs: number;
    avgDurationMs: number;
  }>;
  agents: Array<{ name: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Memory (/api/memory)
// ---------------------------------------------------------------------------

export type MemoryType =
  | "project"
  | "feedback"
  | "reference"
  | "user"
  | "unknown";

export interface MemorySummary {
  /** `${projectDir}/${fileName}` — stable id. */
  id: string;
  projectDir: string;
  fileName: string;
  title: string;
  /** Canonical [[link]] resolution key (frontmatter name or filename stem). */
  slug: string;
  description: string | null;
  type: MemoryType;
  originSessionId: string | null;
  hasFrontmatter: boolean;
  /** Listed in this directory's MEMORY.md index. */
  indexed: boolean;
  indexSummary: string | null;
  sizeBytes: number;
  modifiedAt: string;
}

export interface MemoryEdge {
  sourceId: string;
  targetId: string;
  /** The raw [[slug]] text that created this edge. */
  slug: string;
}

export interface MemoryProjectSummary {
  projectDir: string;
  count: number;
  countsByType: Partial<Record<MemoryType, number>>;
  hasIndex: boolean;
  /** MEMORY.md entries pointing at files that don't exist. */
  orphanIndexEntries: Array<{ title: string; target: string }>;
  lastModified: string | null;
  totalBytes: number;
}

export interface MemoryGraphResponse {
  memories: MemorySummary[];
  edges: MemoryEdge[];
  danglingLinks: Array<{ sourceId: string; slug: string }>;
  projects: MemoryProjectSummary[];
}

export interface MemoryDetailResponse extends MemorySummary {
  /** Markdown body, frontmatter stripped, redacted server-side. */
  body: string;
  outgoing: Array<{ slug: string; targetId: string | null }>;
  backlinks: Array<{ sourceId: string; title: string; projectDir: string }>;
}

/** A conversation message normalized for the replay UI. */
export interface ApiMessage {
  /** Position of the source record in the transcript file (0-based). */
  index: number;
  uuid: string | null;
  parentUuid: string | null;
  role: "user" | "assistant" | "system";
  timestamp: string | null;
  model: string | null;
  blocks: MessageBlock[];
  usage: Usage | null;
  costUsd: number | null;
  isSidechain: boolean;
  /** Harness-injected records (meta prompts, system reminders). */
  isMeta: boolean;
}
