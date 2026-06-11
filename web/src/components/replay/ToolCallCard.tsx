import type { MessageBlock } from "../../../../shared/api-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tool-specific one-line preview shown next to the tool name. */
function preview(block: MessageBlock): string {
  const input = isRecord(block.toolInput) ? block.toolInput : {};
  switch (block.toolName) {
    case "Bash":
      return String(input.command ?? "");
    case "Read":
    case "Write":
    case "Edit":
      return String(input.file_path ?? "");
    case "Glob":
    case "Grep":
      return String(input.pattern ?? "");
    case "Task":
    case "Agent":
      return String(input.description ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    default: {
      const text = JSON.stringify(block.toolInput ?? {});
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
  }
}

export function ToolCallCard(props: { block: MessageBlock }) {
  const { block } = props;
  const input = isRecord(block.toolInput) ? block.toolInput : null;
  return (
    <details className="group rounded-lg border border-indigo-900/50 bg-indigo-950/20">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
        <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 font-medium text-indigo-300">
          {block.toolName}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-zinc-400">
          {preview(block)}
        </span>
        <span className="text-zinc-600 group-open:rotate-90">▸</span>
      </summary>
      <div className="border-t border-indigo-900/40 px-3 py-2">
        {block.toolName === "Edit" && input ? (
          <div className="space-y-2 text-xs">
            <pre className="overflow-x-auto rounded bg-red-950/30 p-2 text-red-300/90">
              {String(input.old_string ?? "")}
            </pre>
            <pre className="overflow-x-auto rounded bg-green-950/30 p-2 text-green-300/90">
              {String(input.new_string ?? "")}
            </pre>
          </div>
        ) : (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-zinc-400">
            {JSON.stringify(block.toolInput, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}
