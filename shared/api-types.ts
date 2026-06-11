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
