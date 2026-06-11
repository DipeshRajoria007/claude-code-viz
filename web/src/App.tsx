import { NavLink, Route, Routes } from "react-router-dom";
import { useMeta } from "./api/queries";
import { ScanProgressBanner } from "./components/ScanProgressBanner";
import MemoryPage from "./pages/MemoryPage";
import OverviewPage from "./pages/OverviewPage";
import SessionReplayPage from "./pages/SessionReplayPage";
import SessionsPage from "./pages/SessionsPage";
import ToolsPage from "./pages/ToolsPage";
import UsagePage from "./pages/UsagePage";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/sessions", label: "Sessions", end: false },
  { to: "/memory", label: "Memory", end: false },
  { to: "/usage", label: "Usage & Cost", end: false },
  { to: "/tools", label: "Tools & Agents", end: false },
];

export default function App() {
  const meta = useMeta();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 p-4">
        <div className="mb-6">
          <h1 className="font-semibold text-lg tracking-tight">
            claude-code-viz
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {meta.data ? `v${meta.data.appVersion}` : "…"} · local only
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 font-medium text-zinc-50"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-[11px] leading-relaxed text-zinc-600">
          Reading{" "}
          <span className="break-all font-mono text-zinc-500">
            {meta.data?.claudeDir ?? "~/.claude"}
          </span>{" "}
          read-only. No data leaves your machine.
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <ScanProgressBanner />
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:id" element={<SessionReplayPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/memory/:project/:file" element={<MemoryPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/tools" element={<ToolsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
