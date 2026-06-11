import type { ApiMessage, MessageBlock } from "../../shared/api-types.js";
import { computeCost } from "./pricing.js";
import type { ModelPricing } from "./pricing-data.js";
import { deepRedact, redactSecrets } from "./redact.js";
import {
  normalizeUsage,
  type RawContentBlock,
  type RawRecord,
} from "./types.js";

export interface NormalizeOptions {
  redact: boolean;
  pricingTable?: ModelPricing[];
}

/** Flatten a tool_result `content` (string or block array) to display text. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === "object" && block !== null) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && typeof b.text === "string") return b.text;
          return `[${b.type ?? "unknown"}]`;
        }
        return String(block);
      })
      .join("\n");
  }
  if (content === undefined || content === null) return "";
  return JSON.stringify(content);
}

function normalizeBlock(
  block: RawContentBlock,
  clean: (text: string) => string,
  cleanDeep: (value: unknown) => unknown,
): MessageBlock {
  switch (block.type) {
    case "text":
      return { kind: "text", text: clean(block.text ?? "") };
    case "thinking":
      return { kind: "thinking", text: clean(block.thinking ?? "") };
    case "tool_use":
      return {
        kind: "tool_use",
        toolName: block.name ?? "unknown",
        toolUseId: block.id,
        toolInput: cleanDeep(block.input),
      };
    case "tool_result":
      return {
        kind: "tool_result",
        toolUseId: block.tool_use_id,
        text: clean(toolResultText(block.content)),
        isError: block.is_error === true,
      };
    case "image":
      return { kind: "image" };
    default:
      return { kind: "unknown", rawType: block.type };
  }
}

/**
 * Turn a raw transcript record into a renderable conversation message.
 * Returns null for records that aren't part of the conversation
 * (titles, attachments, queue operations, …).
 */
export function normalizeRecord(
  record: RawRecord,
  index: number,
  options: NormalizeOptions,
): ApiMessage | null {
  if (
    record.type !== "user" &&
    record.type !== "assistant" &&
    record.type !== "system"
  ) {
    return null;
  }
  const clean = options.redact ? redactSecrets : (text: string) => text;
  const cleanDeep = options.redact ? deepRedact : (value: unknown) => value;

  const content = record.message?.content;
  let blocks: MessageBlock[];
  if (typeof content === "string") {
    blocks = [{ kind: "text", text: clean(content) }];
  } else if (Array.isArray(content)) {
    blocks = content.map((block) => normalizeBlock(block, clean, cleanDeep));
  } else {
    blocks = [];
  }

  const rawUsage =
    record.type === "assistant" ? record.message?.usage : undefined;
  const usage = rawUsage ? normalizeUsage(rawUsage) : null;
  const model = record.message?.model ?? null;
  let costUsd: number | null = null;
  if (usage && model) {
    costUsd = computeCost(usage, model, options.pricingTable).usd;
  }

  return {
    index,
    uuid: record.uuid ?? null,
    parentUuid: record.parentUuid ?? null,
    role: record.type,
    timestamp: record.timestamp ?? null,
    model,
    blocks,
    usage,
    costUsd,
    isSidechain: record.isSidechain === true,
    isMeta: record.isMeta === true,
  };
}
