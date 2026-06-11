import type { ReactNode } from "react";

export function StatCard(props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">
        {props.label}
      </div>
      <div className="mt-1 font-semibold text-2xl tabular-nums">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-xs text-zinc-500">{props.hint}</div>
      ) : null}
    </div>
  );
}
