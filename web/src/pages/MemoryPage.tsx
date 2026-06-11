import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { MemoryType } from "../../../shared/api-types";
import { useMemoryDetail, useMemoryGraph } from "../api/queries";
import { MemoryCard } from "../components/memory/MemoryCard";
import { MemoryDetail } from "../components/memory/MemoryDetail";
import { MemoryGraphView } from "../components/memory/MemoryGraphView";
import {
  MEMORY_TYPE_COLORS,
  MEMORY_TYPES,
} from "../components/memory/memoryColors";
import { formatCount, projectLabel } from "../lib/format";

type ViewMode = "cards" | "graph";

export default function MemoryPage() {
  const graph = useMemoryGraph();
  const { project, file } = useParams<{ project: string; file: string }>();
  const detail = useMemoryDetail(project, file);
  const [view, setView] = useState<ViewMode>("graph");
  const [activeTypes, setActiveTypes] = useState<Set<MemoryType>>(new Set());

  const memories = graph.data?.memories ?? [];
  const typeCounts = useMemo(() => {
    const counts = new Map<MemoryType, number>();
    for (const memory of memories) {
      counts.set(memory.type, (counts.get(memory.type) ?? 0) + 1);
    }
    return counts;
  }, [memories]);

  const filtered = useMemo(
    () =>
      activeTypes.size === 0
        ? memories
        : memories.filter((memory) => activeTypes.has(memory.type)),
    [memories, activeTypes],
  );

  const byProject = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const memory of filtered) {
      const list = groups.get(memory.projectDir);
      if (list) list.push(memory);
      else groups.set(memory.projectDir, [memory]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  function toggleType(type: MemoryType): void {
    const next = new Set(activeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setActiveTypes(next);
  }

  if (graph.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading memories…</p>;
  }
  if (graph.isError || !graph.data) {
    return (
      <p className="py-20 text-center text-red-400">Failed to load memories.</p>
    );
  }
  if (memories.length === 0) {
    return (
      <div className="py-20 text-center text-zinc-500">
        <h2 className="font-medium text-lg text-zinc-300">No memories yet</h2>
        <p className="mt-2 text-sm">
          Claude Code writes memory files under{" "}
          <span className="font-mono">projects/&lt;project&gt;/memory/</span> as
          you work — nothing there yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {MEMORY_TYPES.filter((type) => (typeCounts.get(type) ?? 0) > 0).map(
          (type) => {
            const active = activeTypes.size === 0 || activeTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-zinc-600 bg-zinc-800 text-zinc-200"
                    : "border-zinc-800 text-zinc-600"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: MEMORY_TYPE_COLORS[type],
                    opacity: active ? 1 : 0.4,
                  }}
                />
                {type} ({typeCounts.get(type)})
              </button>
            );
          },
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {formatCount(filtered.length)} memories ·{" "}
            {formatCount(graph.data.projects.length)} projects ·{" "}
            {formatCount(graph.data.edges.length)} links
          </span>
          <div className="flex overflow-hidden rounded-md border border-zinc-700">
            {(["graph", "cards"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`px-3 py-1 text-xs capitalize ${
                  view === mode
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800/40"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "graph" ? (
        <MemoryGraphView
          memories={filtered}
          edges={graph.data.edges}
          danglingCount={graph.data.danglingLinks.length}
        />
      ) : (
        <div className="space-y-6">
          {byProject.map(([projectDir, projectMemories]) => {
            const summary = graph.data?.projects.find(
              (entry) => entry.projectDir === projectDir,
            );
            return (
              <section key={projectDir}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="font-medium text-sm text-zinc-300">
                    {projectLabel(projectDir)}
                  </h2>
                  <span className="text-xs text-zinc-600">
                    {projectMemories.length}
                  </span>
                  {summary && !summary.hasIndex ? (
                    <span className="text-[10px] text-zinc-600">
                      no MEMORY.md index
                    </span>
                  ) : null}
                  {summary && summary.orphanIndexEntries.length > 0 ? (
                    <span
                      className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[10px] text-amber-400"
                      title={`MEMORY.md lists missing files: ${summary.orphanIndexEntries
                        .map((entry) => entry.target)
                        .join(", ")}`}
                    >
                      {summary.orphanIndexEntries.length} orphan index entr
                      {summary.orphanIndexEntries.length === 1 ? "y" : "ies"}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {projectMemories.map((memory) => (
                    <MemoryCard key={memory.id} memory={memory} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {detail.data ? <MemoryDetail detail={detail.data} /> : null}
      {project && file && detail.isError ? (
        <div className="fixed inset-y-0 right-0 z-20 w-full max-w-xl border-zinc-800 border-l bg-zinc-950 p-8 text-center text-red-400">
          Memory not found.
        </div>
      ) : null}
    </div>
  );
}
