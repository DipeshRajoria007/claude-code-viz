import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useModelAnalytics, useToolsAnalytics } from "../api/queries";
import { CostBadge } from "../components/CostBadge";
import { formatCount, formatTokens } from "../lib/format";

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
} as const;

export default function ToolsPage() {
  const tools = useToolsAnalytics();
  const models = useModelAnalytics();

  if (tools.isLoading) {
    return (
      <p className="py-20 text-center text-zinc-500">Loading analytics…</p>
    );
  }

  const toolBars = (tools.data?.tools ?? []).slice(0, 20);
  const modelPie = (models.data ?? []).map((model) => ({
    name: model.model,
    value:
      model.usage.input +
      model.usage.output +
      model.usage.cacheRead +
      model.usage.cacheCreate5m +
      model.usage.cacheCreate1h,
  }));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 font-medium text-sm text-zinc-300">
          Tool calls — top {toolBars.length}
        </h2>
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, toolBars.length * 28)}
        >
          <BarChart data={toolBars} layout="vertical">
            <CartesianGrid stroke="#27272a" horizontal={false} />
            <XAxis type="number" stroke="#52525b" fontSize={11} />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              stroke="#52525b"
              fontSize={11}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="#06b6d4" name="calls" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 font-medium text-sm text-zinc-300">
            Token share by model
          </h2>
          {modelPie.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              No usage yet.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={modelPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {modelPie.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => formatTokens(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1 text-xs">
                {(models.data ?? []).map((model, index) => (
                  <li key={model.model} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{
                        background: PIE_COLORS[index % PIE_COLORS.length],
                      }}
                    />
                    <span className="font-mono text-zinc-300">
                      {model.model}
                    </span>
                    <span className="ml-auto text-zinc-500 tabular-nums">
                      {formatTokens(
                        model.usage.input +
                          model.usage.output +
                          model.usage.cacheRead +
                          model.usage.cacheCreate5m +
                          model.usage.cacheCreate1h,
                      )}{" "}
                      · <CostBadge usd={model.costUsd} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-3 font-medium text-sm text-zinc-300">Hooks</h2>
          {(tools.data?.hooks ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              No hook activity recorded.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th className="py-1.5 font-medium">Hook</th>
                  <th className="py-1.5 text-right font-medium">OK</th>
                  <th className="py-1.5 text-right font-medium">Fail</th>
                  <th className="py-1.5 text-right font-medium">Avg ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {(tools.data?.hooks ?? []).map((hook) => (
                  <tr key={hook.name}>
                    <td className="max-w-48 truncate py-1.5 font-mono text-xs text-zinc-300">
                      {hook.name}
                    </td>
                    <td className="py-1.5 text-right text-emerald-400 tabular-nums">
                      {formatCount(hook.success)}
                    </td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        hook.failure > 0 ? "text-red-400" : "text-zinc-600"
                      }`}
                    >
                      {formatCount(hook.failure)}
                    </td>
                    <td className="py-1.5 text-right text-zinc-400 tabular-nums">
                      {Math.round(hook.avgDurationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(tools.data?.agents ?? []).length > 0 ? (
            <>
              <h3 className="mt-5 mb-2 font-medium text-sm text-zinc-300">
                Subagents
              </h3>
              <ul className="space-y-1 text-xs">
                {(tools.data?.agents ?? []).map((agent) => (
                  <li key={agent.name} className="flex justify-between">
                    <span className="font-mono text-zinc-300">
                      {agent.name}
                    </span>
                    <span className="text-zinc-500 tabular-nums">
                      {formatCount(agent.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
