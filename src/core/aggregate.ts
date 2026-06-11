import type { ParsedLine } from "./parser.js";
import {
  addUsage,
  emptyUsage,
  KNOWN_RECORD_TYPES,
  normalizeUsage,
  type RawContentBlock,
  type RawRecord,
  type SessionAggregate,
} from "./types.js";

/** Cap on distinct versions/branches/etc. kept per session, to bound memory. */
const MAX_DISTINCT = 20;
const TITLE_MAX_LENGTH = 80;

const TITLE_PRIORITY = {
  none: 0,
  firstUserPrompt: 1,
  summary: 2,
  aiTitle: 3,
} as const;

export interface Aggregator {
  apply(line: ParsedLine): void;
  finish(): SessionAggregate;
}

export function createAggregate(
  sessionId: string,
  projectDir: string,
): SessionAggregate {
  return {
    sessionId,
    projectDir,
    cwd: null,
    title: null,
    firstTs: null,
    lastTs: null,
    versions: [],
    entrypoints: [],
    gitBranches: [],
    counts: {
      user: 0,
      assistant: 0,
      toolUse: 0,
      toolResultErrors: 0,
      sidechain: 0,
      parseErrors: 0,
      records: 0,
    },
    toolCalls: {},
    agents: {},
    hooks: {},
    usageByModel: {},
    daily: {},
    unknownTypes: {},
  };
}

function getOrInit<T>(map: Record<string, T>, key: string, init: () => T): T {
  let value = map[key];
  if (value === undefined) {
    value = init();
    map[key] = value;
  }
  return value;
}

function addDistinct(list: string[], value: string | undefined): void {
  if (!value || list.length >= MAX_DISTINCT || list.includes(value)) return;
  list.push(value);
}

function dateKey(timestamp: string): string | null {
  // ISO timestamps start with YYYY-MM-DD; avoid Date parsing per record.
  if (/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) return timestamp.slice(0, 10);
  return null;
}

function contentBlocks(record: RawRecord): RawContentBlock[] {
  const content = record.message?.content;
  return Array.isArray(content) ? content : [];
}

/** A user record that carries an actual prompt, not just tool results. */
function isRealUserMessage(record: RawRecord): boolean {
  if (record.isMeta) return false;
  const content = record.message?.content;
  if (typeof content === "string") return content.trim() !== "";
  if (!Array.isArray(content)) return false;
  return content.some((block) => block.type !== "tool_result");
}

function titleCandidateFromUser(record: RawRecord): string | null {
  const content = record.message?.content;
  let text: string | null = null;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const textBlock = content.find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    text = textBlock?.text ?? null;
  }
  if (text === null) return null;
  const trimmed = text.trim();
  // Skip harness-injected wrappers like <command-name> / <system-reminder>.
  if (trimmed === "" || trimmed.startsWith("<")) return null;
  return truncateTitle(trimmed);
}

function truncateTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX_LENGTH) return oneLine;
  return `${oneLine.slice(0, TITLE_MAX_LENGTH - 1)}…`;
}

export function createAggregator(
  sessionId: string,
  projectDir: string,
): Aggregator {
  const agg = createAggregate(sessionId, projectDir);
  const seenUsageKeys = new Set<string>();
  let titlePriority: number = TITLE_PRIORITY.none;

  function setTitle(title: string | null, priority: number): void {
    if (title === null || priority <= titlePriority) return;
    agg.title = truncateTitle(title);
    titlePriority = priority;
  }

  function daily(timestamp: string | undefined) {
    const key = timestamp ? dateKey(timestamp) : null;
    if (key === null) return null;
    let bucket = agg.daily[key];
    if (!bucket) {
      bucket = { messages: 0, toolCalls: 0, usageByModel: {} };
      agg.daily[key] = bucket;
    }
    return bucket;
  }

  function applyTimestamp(record: RawRecord): void {
    const ts = record.timestamp;
    if (typeof ts !== "string" || !dateKey(ts)) return;
    if (agg.firstTs === null || ts < agg.firstTs) agg.firstTs = ts;
    if (agg.lastTs === null || ts > agg.lastTs) agg.lastTs = ts;
  }

  function applyUser(record: RawRecord): void {
    for (const block of contentBlocks(record)) {
      if (block.type === "tool_result" && block.is_error === true) {
        agg.counts.toolResultErrors++;
      }
    }
    if (!isRealUserMessage(record)) return;
    agg.counts.user++;
    const bucket = daily(record.timestamp);
    if (bucket) bucket.messages++;
    setTitle(titleCandidateFromUser(record), TITLE_PRIORITY.firstUserPrompt);
  }

  function applyAssistant(record: RawRecord): void {
    agg.counts.assistant++;
    const bucket = daily(record.timestamp);
    if (bucket) bucket.messages++;

    for (const block of contentBlocks(record)) {
      if (block.type !== "tool_use") continue;
      agg.counts.toolUse++;
      const name = typeof block.name === "string" ? block.name : "unknown";
      agg.toolCalls[name] = (agg.toolCalls[name] ?? 0) + 1;
      if (bucket) bucket.toolCalls++;
    }

    const rawUsage = record.message?.usage;
    if (!rawUsage || typeof rawUsage !== "object") return;
    // Transcripts contain duplicated assistant records (streaming rewrites,
    // retries). Counting the same API response twice would double the cost,
    // so usage is deduped on (message.id, requestId).
    const messageId = record.message?.id;
    const dedupeKey =
      messageId || record.requestId
        ? `${messageId ?? ""}:${record.requestId ?? ""}`
        : null;
    if (dedupeKey !== null) {
      if (seenUsageKeys.has(dedupeKey)) return;
      seenUsageKeys.add(dedupeKey);
    }
    const usage = normalizeUsage(rawUsage);
    const model = record.message?.model ?? "unknown";
    addUsage(getOrInit(agg.usageByModel, model, emptyUsage), usage);
    if (bucket)
      addUsage(getOrInit(bucket.usageByModel, model, emptyUsage), usage);
  }

  function applyAttachment(record: RawRecord): void {
    const attachment = record.attachment;
    if (!attachment) return;
    if (
      attachment.type !== "hook_success" &&
      attachment.type !== "hook_failure"
    )
      return;
    const name =
      typeof attachment.hookName === "string" ? attachment.hookName : "unknown";
    const stats = getOrInit(agg.hooks, name, () => ({
      success: 0,
      failure: 0,
      totalDurationMs: 0,
    }));
    if (attachment.type === "hook_success") stats.success++;
    else stats.failure++;
    if (typeof attachment.durationMs === "number") {
      stats.totalDurationMs += attachment.durationMs;
    }
  }

  function apply(line: ParsedLine): void {
    if (!line.ok) {
      agg.counts.parseErrors++;
      return;
    }
    const record = line.record;
    agg.counts.records++;
    applyTimestamp(record);
    if (agg.cwd === null && typeof record.cwd === "string")
      agg.cwd = record.cwd;
    addDistinct(agg.versions, record.version);
    addDistinct(agg.entrypoints, record.entrypoint);
    addDistinct(agg.gitBranches, record.gitBranch);
    if (record.isSidechain === true) agg.counts.sidechain++;

    switch (record.type) {
      case "user":
        applyUser(record);
        break;
      case "assistant":
        applyAssistant(record);
        break;
      case "attachment":
        applyAttachment(record);
        break;
      case "ai-title":
        if (typeof record.aiTitle === "string") {
          setTitle(record.aiTitle, TITLE_PRIORITY.aiTitle);
        }
        break;
      case "summary":
        if (typeof record.summary === "string") {
          setTitle(record.summary, TITLE_PRIORITY.summary);
        }
        break;
      case "agent-name":
        if (typeof record.agentName === "string") {
          agg.agents[record.agentName] =
            (agg.agents[record.agentName] ?? 0) + 1;
        }
        break;
      default:
        if (!KNOWN_RECORD_TYPES.has(record.type)) {
          agg.unknownTypes[record.type] =
            (agg.unknownTypes[record.type] ?? 0) + 1;
        }
        break;
    }
  }

  return { apply, finish: () => agg };
}

/** Convenience for tests and one-shot aggregation. */
export function aggregateRecords(
  sessionId: string,
  projectDir: string,
  lines: Iterable<ParsedLine>,
): SessionAggregate {
  const aggregator = createAggregator(sessionId, projectDir);
  for (const line of lines) aggregator.apply(line);
  return aggregator.finish();
}
