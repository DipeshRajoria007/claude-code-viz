import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ApiMessage, MessageBlock } from "../../../../shared/api-types";
import { formatDateTime } from "../../lib/format";
import { CostBadge } from "../CostBadge";
import { ToolCallCard } from "./ToolCallCard";
import { ToolResultCard } from "./ToolResultCard";

function Block(props: { block: MessageBlock; role: ApiMessage["role"] }) {
  const { block } = props;
  switch (block.kind) {
    case "text":
      if (!block.text?.trim()) return null;
      return props.role === "assistant" ? (
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-950 prose-pre:text-xs">
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{block.text}</p>
      );
    case "thinking":
      if (!block.text?.trim()) return null;
      return (
        <details className="rounded-lg border border-zinc-800 bg-zinc-900/30">
          <summary className="cursor-pointer px-3 py-1.5 text-xs text-zinc-500">
            💭 thinking
          </summary>
          <p className="whitespace-pre-wrap border-t border-zinc-800/60 px-3 py-2 text-xs text-zinc-500 italic">
            {block.text}
          </p>
        </details>
      );
    case "tool_use":
      return <ToolCallCard block={block} />;
    case "tool_result":
      return <ToolResultCard block={block} />;
    case "image":
      return <div className="text-xs text-zinc-500">[image]</div>;
    default:
      return (
        <div className="text-xs text-zinc-600">
          [{block.rawType ?? "unknown"} block]
        </div>
      );
  }
}

export function MessageBubble(props: { message: ApiMessage }) {
  const { message } = props;
  const isUser = message.role === "user";
  const onlyToolResults =
    message.blocks.length > 0 &&
    message.blocks.every((block) => block.kind === "tool_result");

  return (
    <div
      className={`rounded-xl border p-3 ${
        message.isSidechain ? "ml-8 border-dashed" : ""
      } ${
        isUser && !onlyToolResults
          ? "border-zinc-700 bg-zinc-800/40"
          : "border-zinc-800/80 bg-zinc-900/30"
      } ${message.isMeta ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
        <span
          className={`font-medium uppercase tracking-wide ${
            isUser ? "text-emerald-400/90" : "text-sky-400/90"
          }`}
        >
          {onlyToolResults ? "tool output" : message.role}
        </span>
        {message.model ? (
          <span className="font-mono">{message.model}</span>
        ) : null}
        {message.isSidechain ? (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">subagent</span>
        ) : null}
        {message.isMeta ? (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">meta</span>
        ) : null}
        <span className="ml-auto">{formatDateTime(message.timestamp)}</span>
        {message.costUsd !== null ? (
          <CostBadge usd={message.costUsd} className="tabular-nums" />
        ) : null}
      </div>
      <div className="space-y-2">
        {message.blocks.map((block, index) => (
          <Block
            key={`${message.uuid}-${index}`}
            block={block}
            role={message.role}
          />
        ))}
      </div>
    </div>
  );
}
