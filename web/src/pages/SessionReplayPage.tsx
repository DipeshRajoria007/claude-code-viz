import { Link, useParams } from "react-router-dom";
import { useSessionDetail, useSessionMessages } from "../api/queries";
import { CostBadge } from "../components/CostBadge";
import { MessageBubble } from "../components/replay/MessageBubble";
import {
  formatCount,
  formatDateTime,
  formatTokens,
  projectLabel,
} from "../lib/format";

export default function SessionReplayPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useSessionDetail(id);
  const messages = useSessionMessages(id);

  if (detail.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading session…</p>;
  }
  if (detail.isError || !detail.data) {
    return (
      <p className="py-20 text-center text-red-400">
        Session not found.{" "}
        <Link to="/sessions" className="underline">
          Back to sessions
        </Link>
      </p>
    );
  }

  const session = detail.data;
  const totalTokens = Object.values(session.usageByModel).reduce(
    (sum, usage) =>
      sum +
      usage.input +
      usage.output +
      usage.cacheRead +
      usage.cacheCreate5m +
      usage.cacheCreate1h,
    0,
  );
  const loadedMessages = (messages.data?.pages ?? []).flatMap(
    (page) => page.items,
  );

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/sessions"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← All sessions
        </Link>
        <h2 className="mt-1 font-semibold text-xl">
          {session.title ?? session.sessionId}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="rounded-full bg-zinc-800 px-2.5 py-1">
            {session.cwd ?? projectLabel(session.projectDir)}
          </span>
          {session.gitBranches.map((branch) => (
            <span
              key={branch}
              className="rounded-full bg-zinc-800 px-2.5 py-1 font-mono"
            >
              ⎇ {branch}
            </span>
          ))}
          {session.models.map((model) => (
            <span
              key={model}
              className="rounded-full bg-zinc-800 px-2.5 py-1 font-mono"
            >
              {model}
            </span>
          ))}
          <span className="rounded-full bg-zinc-800 px-2.5 py-1">
            {formatCount(session.messages)} messages ·{" "}
            {formatCount(session.toolCalls)} tool calls
          </span>
          <span className="rounded-full bg-zinc-800 px-2.5 py-1">
            {formatTokens(totalTokens)} tokens
          </span>
          <span className="rounded-full bg-zinc-800 px-2.5 py-1">
            <CostBadge usd={session.costUsd} />
          </span>
          <span className="text-zinc-600">
            {formatDateTime(session.firstTs)} → {formatDateTime(session.lastTs)}
          </span>
        </div>
        {Object.keys(session.unknownTypes).length > 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">
            Contains record types this version doesn't understand:{" "}
            {Object.keys(session.unknownTypes).join(", ")} (skipped)
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {loadedMessages.map((message) => (
          <MessageBubble key={`${message.index}`} message={message} />
        ))}
        {messages.isLoading ? (
          <p className="py-10 text-center text-zinc-500">Loading messages…</p>
        ) : null}
        {messages.hasNextPage ? (
          <button
            type="button"
            disabled={messages.isFetchingNextPage}
            onClick={() => messages.fetchNextPage()}
            className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-50"
          >
            {messages.isFetchingNextPage ? "Loading…" : "Load more messages"}
          </button>
        ) : null}
        {!messages.isLoading && loadedMessages.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">
            No renderable messages in this transcript.
          </p>
        ) : null}
      </div>
    </div>
  );
}
