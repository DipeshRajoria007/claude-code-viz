/**
 * Factories for synthetic transcript records mirroring the real shapes
 * found in ~/.claude/projects/*.jsonl. Test data only — never real content.
 */
import type { ParsedLine } from "../../src/core/parser.js";
import type {
  RawContentBlock,
  RawRecord,
  RawUsage,
} from "../../src/core/types.js";

let counter = 0;
function nextId(prefix: string): string {
  counter++;
  return `${prefix}_${String(counter).padStart(6, "0")}`;
}

const BASE = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  cwd: "/home/test/project",
  gitBranch: "main",
  version: "2.1.100",
  entrypoint: "cli",
  userType: "external",
};

export function ok(record: RawRecord): ParsedLine {
  return { ok: true, record };
}

export function badLine(lineNumber = 1): ParsedLine {
  return { ok: false, lineNumber };
}

export function userRecord(
  content: string | RawContentBlock[],
  overrides: Partial<RawRecord> = {},
): RawRecord {
  return {
    ...BASE,
    type: "user",
    uuid: nextId("uuid"),
    parentUuid: null,
    timestamp: "2026-06-01T10:00:00.000Z",
    message: { role: "user", content },
    ...overrides,
  };
}

export function usage(overrides: Partial<RawUsage> = {}): RawUsage {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    ...overrides,
  };
}

export function assistantRecord(
  content: RawContentBlock[],
  overrides: Partial<RawRecord> & { model?: string; usage?: RawUsage } = {},
): RawRecord {
  const {
    model = "claude-opus-4-8",
    usage: usageOverride,
    ...rest
  } = overrides;
  return {
    ...BASE,
    type: "assistant",
    uuid: nextId("uuid"),
    parentUuid: null,
    requestId: nextId("req"),
    timestamp: "2026-06-01T10:00:05.000Z",
    message: {
      id: nextId("msg"),
      type: "message",
      role: "assistant",
      model,
      content,
      stop_reason: "end_turn",
      usage: usageOverride ?? usage(),
    },
    ...rest,
  };
}

export function textBlock(text: string): RawContentBlock {
  return { type: "text", text };
}

export function toolUseBlock(
  name: string,
  input: unknown = {},
): RawContentBlock {
  return { type: "tool_use", id: nextId("toolu"), name, input };
}

export function toolResultBlock(
  toolUseId: string,
  content: unknown,
  isError = false,
): RawContentBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };
}

export function hookAttachment(
  hookName: string,
  success: boolean,
  durationMs = 25,
): RawRecord {
  return {
    ...BASE,
    type: "attachment",
    uuid: nextId("uuid"),
    timestamp: "2026-06-01T10:00:01.000Z",
    attachment: {
      type: success ? "hook_success" : "hook_failure",
      hookName,
      hookEvent: hookName.split(":")[0],
      durationMs,
      exitCode: success ? 0 : 1,
    },
  };
}

export function aiTitleRecord(aiTitle: string): RawRecord {
  return { type: "ai-title", aiTitle, sessionId: BASE.sessionId };
}

export function summaryRecord(
  summary: string,
  leafUuid = nextId("uuid"),
): RawRecord {
  return { type: "summary", summary, leafUuid };
}

export function agentNameRecord(agentName: string): RawRecord {
  return { type: "agent-name", agentName, sessionId: BASE.sessionId };
}
