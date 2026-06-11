import { useState } from "react";
import type { MessageBlock } from "../../../../shared/api-types";

const TRUNCATE_AT = 1500;

export function ToolResultCard(props: { block: MessageBlock }) {
  const { block } = props;
  const [expanded, setExpanded] = useState(false);
  const text = block.text ?? "";
  const truncated = !expanded && text.length > TRUNCATE_AT;
  const shown = truncated ? text.slice(0, TRUNCATE_AT) : text;

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        block.isError
          ? "border-red-900/60 bg-red-950/20"
          : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <div className="mb-1 text-[10px] text-zinc-500 uppercase tracking-wide">
        {block.isError ? "tool result · error" : "tool result"}
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-400">
        {shown}
        {truncated ? "…" : ""}
      </pre>
      {text.length > TRUNCATE_AT ? (
        <button
          type="button"
          className="mt-1 text-indigo-400 text-xs hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Show less"
            : `Show all ${text.length.toLocaleString()} chars`}
        </button>
      ) : null}
    </div>
  );
}
