import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsageBucket } from "../../../shared/api-types";
import { useUsageAnalytics } from "../api/queries";
import { CostBadge } from "../components/CostBadge";
import { formatTokens, formatUsd, projectLabel } from "../lib/format";

type GroupBy = "day" | "project" | "model";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
} as const;

function totalTokens(bucket: UsageBucket): number {
  const { input, output, cacheRead, cacheCreate5m, cacheCreate1h } =
    bucket.usage;
  return input + output + cacheRead + cacheCreate5m + cacheCreate1h;
}

export default function UsagePage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const usage = useUsageAnalytics(groupBy);

  const buckets = usage.data ?? [];
  const chartData = buckets.map((bucket) => ({
    key:
      groupBy === "project"
        ? projectLabel(bucket.key)
        : groupBy === "day"
          ? bucket.key.slice(5)
          : bucket.key,
    fullKey: bucket.key,
    cost: bucket.costUsd === null ? 0 : Number(bucket.costUsd.toFixed(2)),
    cacheHitPct: Number((bucket.cacheHitRate * 100).toFixed(1)),
    tokens: totalTokens(bucket),
  }));
  const topByCost = [...chartData].sort((a, b) => b.cost - a.cost).slice(0, 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["day", "project", "model"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setGroupBy(option)}
            className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
              groupBy === option
                ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/50"
            }`}
          >
            by {option}
          </button>
        ))}
      </div>

      {usage.isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading usage…</p>
      ) : groupBy === "day" ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 font-medium text-sm text-zinc-300">
            Estimated cost per day (bars) and cache hit rate (line)
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="key" stroke="#52525b" fontSize={11} />
              <YAxis
                yAxisId="cost"
                stroke="#52525b"
                fontSize={11}
                tickFormatter={(value: number) => `$${value}`}
              />
              <YAxis
                yAxisId="cache"
                orientation="right"
                domain={[0, 100]}
                stroke="#52525b"
                fontSize={11}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                yAxisId="cost"
                dataKey="cost"
                fill="#6366f1"
                name="est. cost ($)"
              />
              <Line
                yAxisId="cache"
                type="monotone"
                dataKey="cacheHitPct"
                stroke="#22c55e"
                dot={false}
                name="cache hit %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 font-medium text-sm text-zinc-300">
            Top {groupBy === "project" ? "projects" : "models"} by estimated
            cost
          </h2>
          <ResponsiveContainer
            width="100%"
            height={Math.max(220, topByCost.length * 32)}
          >
            <BarChart data={topByCost} layout="vertical">
              <CartesianGrid stroke="#27272a" horizontal={false} />
              <XAxis
                type="number"
                stroke="#52525b"
                fontSize={11}
                tickFormatter={(value: number) => `$${value}`}
              />
              <YAxis
                type="category"
                dataKey="key"
                width={160}
                stroke="#52525b"
                fontSize={11}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="cost" fill="#6366f1" name="est. cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium">{groupBy}</th>
              <th className="px-4 py-2 text-right font-medium">Input</th>
              <th className="px-4 py-2 text-right font-medium">Output</th>
              <th className="px-4 py-2 text-right font-medium">Cache read</th>
              <th className="px-4 py-2 text-right font-medium">Cache write</th>
              <th className="px-4 py-2 text-right font-medium">Hit rate</th>
              <th className="px-4 py-2 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {buckets.map((bucket) => (
              <tr key={bucket.key} className="hover:bg-zinc-800/30">
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-zinc-300">
                  {bucket.key}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {formatTokens(bucket.usage.input)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {formatTokens(bucket.usage.output)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {formatTokens(bucket.usage.cacheRead)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {formatTokens(
                    bucket.usage.cacheCreate5m + bucket.usage.cacheCreate1h,
                  )}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {(bucket.cacheHitRate * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {bucket.costUsd === null ? (
                    <span title="model not in pricing table">
                      {formatUsd(null)}
                    </span>
                  ) : (
                    <CostBadge usd={bucket.costUsd} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
