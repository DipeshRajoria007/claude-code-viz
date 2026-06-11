import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects, useSessions } from "../api/queries";
import { CostBadge } from "../components/CostBadge";
import { formatCount, formatRelative, projectLabel } from "../lib/format";

const PAGE_SIZE = 50;

export default function SessionsPage() {
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState("recent");
  const [cursor, setCursor] = useState(0);

  const projects = useProjects();
  const sessions = useSessions({
    q: q || undefined,
    project: project || undefined,
    sort,
    cursor,
    limit: PAGE_SIZE,
  });

  function resetAnd(setter: () => void): void {
    setCursor(0);
    setter();
  }

  const total = sessions.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : cursor + 1;
  const pageEnd = cursor + (sessions.data?.items.length ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(event) => resetAnd(() => setQ(event.target.value))}
          placeholder="Search titles, ids, projects…"
          className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <select
          value={project}
          onChange={(event) => resetAnd(() => setProject(event.target.value))}
          className="max-w-56 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        >
          <option value="">All projects</option>
          {(projects.data ?? []).map((entry) => (
            <option key={entry.projectDir} value={entry.projectDir}>
              {entry.cwd ?? projectLabel(entry.projectDir)} ({entry.sessions})
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => resetAnd(() => setSort(event.target.value))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="cost">Highest cost</option>
          <option value="messages">Most messages</option>
        </select>
        <span className="ml-auto text-xs text-zinc-500">
          {pageStart}–{pageEnd} of {formatCount(total)}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium">Session</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 text-right font-medium">Messages</th>
              <th className="px-4 py-2 text-right font-medium">Tools</th>
              <th className="px-4 py-2 text-right font-medium">Est. cost</th>
              <th className="px-4 py-2 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {(sessions.data?.items ?? []).map((session) => (
              <tr key={session.sessionId} className="hover:bg-zinc-800/30">
                <td className="max-w-md px-4 py-2.5">
                  <Link
                    to={`/sessions/${session.sessionId}`}
                    className="block truncate text-zinc-200 hover:text-white hover:underline"
                  >
                    {session.title ?? session.sessionId}
                  </Link>
                  <span className="font-mono text-[10px] text-zinc-600">
                    {session.sessionId.slice(0, 8)} ·{" "}
                    {session.models.join(", ") || "no model"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {projectLabel(session.projectDir)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-300 tabular-nums">
                  {formatCount(session.messages)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">
                  {formatCount(session.toolCalls)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <CostBadge usd={session.costUsd} />
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                  {formatRelative(session.lastTs)}
                </td>
              </tr>
            ))}
            {sessions.data?.items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-zinc-500"
                >
                  No sessions match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={cursor === 0}
          onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={sessions.data?.nextCursor == null}
          onClick={() => setCursor(sessions.data?.nextCursor ?? cursor)}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
