import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOverview } from "../api/queries";
import { CostBadge } from "../components/CostBadge";
import { Heatmap, type HeatmapDay } from "../components/Heatmap";
import { StatCard } from "../components/StatCard";
import {
  formatCount,
  formatRelative,
  formatTokens,
  formatUsd,
  projectLabel,
} from "../lib/format";

export default function OverviewPage() {
  const overview = useOverview();

  if (overview.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading overview…</p>;
  }
  if (overview.isError || !overview.data) {
    return (
      <p className="py-20 text-center text-red-400">
        Failed to load overview. Is the server still running?
      </p>
    );
  }

  const { totals, daily, statsCacheDaily, recentSessions } = overview.data;
  const totalTokens =
    totals.usage.input +
    totals.usage.output +
    totals.usage.cacheRead +
    totals.usage.cacheCreate5m +
    totals.usage.cacheCreate1h;

  // Until the first scan lands, fall back to Claude Code's own stats cache.
  const heatmapDays: HeatmapDay[] =
    daily.length > 0
      ? daily.map((day) => ({
          date: day.date,
          value: day.messages,
          label: `${day.date}: ${formatCount(day.messages)} messages, ${formatCount(day.toolCalls)} tool calls, ${formatUsd(day.costUsd)}`,
        }))
      : (statsCacheDaily ?? []).map((day) => ({
          date: day.date,
          value: day.messageCount,
          label: `${day.date}: ${formatCount(day.messageCount)} messages (from Claude Code stats cache)`,
        }));

  const chartData = daily.map((day) => ({
    date: day.date.slice(5),
    messages: day.messages,
    cost: Number(day.costUsd.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sessions" value={formatCount(totals.sessions)} />
        <StatCard
          label="Messages"
          value={formatCount(totals.messages)}
          hint={`${formatCount(totals.toolCalls)} tool calls`}
        />
        <StatCard
          label="Tokens"
          value={formatTokens(totalTokens)}
          hint={`${formatTokens(totals.usage.cacheRead)} from cache`}
        />
        <StatCard
          label="Est. cost"
          value={<CostBadge usd={totals.costUsd} />}
          hint={
            totals.unpricedModels.length > 0
              ? `${totals.unpricedModels.length} unpriced model(s) excluded`
              : "all models priced"
          }
        />
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 font-medium text-sm text-zinc-300">
          Activity — last 12 months
        </h2>
        <Heatmap days={heatmapDays} />
      </section>

      {chartData.length > 1 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 font-medium text-sm text-zinc-300">
            Messages over time
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#52525b" fontSize={11} />
              <YAxis stroke="#52525b" fontSize={11} width={40} />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
              />
              <Area
                type="monotone"
                dataKey="messages"
                stroke="#22c55e"
                fill="#22c55e22"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h2 className="border-b border-zinc-800 px-4 py-3 font-medium text-sm text-zinc-300">
          Recent sessions
        </h2>
        <ul className="divide-y divide-zinc-800/70">
          {recentSessions.map((session) => (
            <li key={session.sessionId}>
              <Link
                to={`/sessions/${session.sessionId}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-200">
                    {session.title ?? session.sessionId}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {projectLabel(session.projectDir)} ·{" "}
                    {formatCount(session.messages)} messages
                  </div>
                </div>
                <CostBadge
                  usd={session.costUsd}
                  className="text-sm text-zinc-400 tabular-nums"
                />
                <span className="w-20 text-right text-xs text-zinc-500">
                  {formatRelative(session.lastTs)}
                </span>
              </Link>
            </li>
          ))}
          {recentSessions.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">
              No sessions found yet — waiting for the first scan to finish.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
