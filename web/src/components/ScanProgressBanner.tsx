import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api/client";
import { useScanStatus } from "../api/queries";

export function ScanProgressBanner() {
  const status = useScanStatus();
  const queryClient = useQueryClient();

  if (!status.data) return null;

  if (status.data.state === "scanning") {
    const { filesDone, filesTotal } = status.data;
    const percent =
      filesTotal > 0 ? Math.round((filesDone / filesTotal) * 100) : 0;
    return (
      <div className="border-b border-amber-900/40 bg-amber-950/30 px-6 py-2 text-amber-200 text-sm">
        Scanning transcripts… {filesDone}/{filesTotal} files ({percent}%) — data
        below updates when the scan finishes.
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-amber-900/30">
          <div
            className="h-full bg-amber-400/70 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">
      <span>
        {status.data.lastCompletedAt
          ? `Index up to date · last scan ${new Date(status.data.lastCompletedAt).toLocaleTimeString()}`
          : "Index loaded from cache"}
        {status.data.errors > 0 ? ` · ${status.data.errors} file errors` : ""}
      </span>
      <button
        type="button"
        className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        onClick={async () => {
          await apiPost("/api/scan/refresh");
          queryClient.invalidateQueries({ queryKey: ["scan-status"] });
        }}
      >
        Refresh
      </button>
    </div>
  );
}
