import { Link } from "react-router-dom";
import type { MemorySummary } from "../../../../shared/api-types";
import { formatRelative } from "../../lib/format";
import { MEMORY_TYPE_COLORS } from "./memoryColors";

export function TypePill(props: { type: MemorySummary["type"] }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300 uppercase tracking-wide"
      title={`memory type: ${props.type}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: MEMORY_TYPE_COLORS[props.type] }}
      />
      {props.type}
    </span>
  );
}

export function memoryRoute(
  memory: Pick<MemorySummary, "projectDir" | "fileName">,
) {
  return `/memory/${encodeURIComponent(memory.projectDir)}/${encodeURIComponent(memory.fileName)}`;
}

export function MemoryCard(props: { memory: MemorySummary }) {
  const { memory } = props;
  const blurb = memory.description ?? memory.indexSummary;
  return (
    <Link
      to={memoryRoute(memory)}
      className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-center gap-2">
        <TypePill type={memory.type} />
        {!memory.indexed ? (
          <span
            className="text-[10px] text-zinc-600"
            title="not listed in this project's MEMORY.md index"
          >
            unindexed
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-zinc-600">
          {formatRelative(memory.modifiedAt)}
        </span>
      </div>
      <div className="font-medium text-sm text-zinc-200 leading-snug">
        {memory.title}
      </div>
      {blurb ? (
        <p className="line-clamp-2 text-xs text-zinc-500">{blurb}</p>
      ) : null}
    </Link>
  );
}
