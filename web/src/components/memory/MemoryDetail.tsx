import { useMemo } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";
import type { MemoryDetailResponse } from "../../../../shared/api-types";
import { formatDateTime, projectLabel } from "../../lib/format";
import { TypePill } from "./MemoryCard";

function memoryHref(targetId: string): string {
  const slash = targetId.indexOf("/");
  const projectDir = targetId.slice(0, slash);
  const fileName = targetId.slice(slash + 1);
  return `/memory/${encodeURIComponent(projectDir)}/${encodeURIComponent(fileName)}`;
}

/** Render markdown links to /memory/... as in-app router links. */
function WikiAnchor(props: { href?: string; children?: React.ReactNode }) {
  if (props.href?.startsWith("/memory/")) {
    return (
      <Link
        to={props.href}
        className="text-cyan-400 no-underline hover:underline"
      >
        {props.children}
      </Link>
    );
  }
  return (
    <a href={props.href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  );
}

export function MemoryDetail(props: { detail: MemoryDetailResponse }) {
  const { detail } = props;
  const navigate = useNavigate();

  // Turn resolved [[slug]] occurrences into real markdown links; dangling
  // slugs stay as literal [[slug]] text.
  const body = useMemo(() => {
    let result = detail.body;
    for (const { slug, targetId } of detail.outgoing) {
      if (targetId === null) continue;
      result = result.replaceAll(
        `[[${slug}]]`,
        `[${slug}](${memoryHref(targetId)})`,
      );
    }
    return result;
  }, [detail]);

  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-zinc-800 border-l bg-zinc-950 shadow-2xl">
      <div className="sticky top-0 flex items-center gap-2 border-zinc-800 border-b bg-zinc-950/95 px-5 py-3 backdrop-blur">
        <TypePill type={detail.type} />
        <span className="truncate text-xs text-zinc-500">
          {projectLabel(detail.projectDir)} / {detail.fileName}
        </span>
        <button
          type="button"
          onClick={() => navigate("/memory")}
          className="ml-auto rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          ✕ close
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <h2 className="font-semibold text-lg text-zinc-100">
            {detail.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>updated {formatDateTime(detail.modifiedAt)}</span>
            <span>{detail.sizeBytes.toLocaleString()} bytes</span>
            {!detail.indexed ? (
              <span className="text-amber-500/80">not in MEMORY.md</span>
            ) : null}
            {detail.originSessionId ? (
              <Link
                to={`/sessions/${detail.originSessionId}`}
                className="text-cyan-400 hover:underline"
              >
                origin session ↗
              </Link>
            ) : null}
          </div>
        </div>

        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-900 prose-pre:text-xs">
          <Markdown remarkPlugins={[remarkGfm]} components={{ a: WikiAnchor }}>
            {body}
          </Markdown>
        </div>

        {detail.outgoing.length > 0 ? (
          <section className="rounded-lg border border-zinc-800 p-3">
            <h3 className="mb-2 text-xs text-zinc-500 uppercase tracking-wide">
              Links from this memory
            </h3>
            <ul className="space-y-1 text-sm">
              {detail.outgoing.map((link) => (
                <li key={link.slug}>
                  {link.targetId ? (
                    <Link
                      to={memoryHref(link.targetId)}
                      className="text-cyan-400 hover:underline"
                    >
                      [[{link.slug}]]
                    </Link>
                  ) : (
                    <span
                      className="text-zinc-600"
                      title="no memory with this slug"
                    >
                      [[{link.slug}]] — not found
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {detail.backlinks.length > 0 ? (
          <section className="rounded-lg border border-zinc-800 p-3">
            <h3 className="mb-2 text-xs text-zinc-500 uppercase tracking-wide">
              Referenced by
            </h3>
            <ul className="space-y-1 text-sm">
              {detail.backlinks.map((backlink) => (
                <li key={backlink.sourceId}>
                  <Link
                    to={memoryHref(backlink.sourceId)}
                    className="text-cyan-400 hover:underline"
                  >
                    {backlink.title}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-600">
                    {projectLabel(backlink.projectDir)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
