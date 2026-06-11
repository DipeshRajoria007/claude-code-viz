import { Hono } from "hono";
import type {
  MessagesPageResponse,
  SessionDetailResponse,
  SessionsPageResponse,
} from "../../../shared/api-types.js";
import { readMessagePage } from "../../core/sessionReader.js";
import type { AppState } from "../state.js";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 500;
const DEFAULT_MESSAGE_PAGE = 200;

type SortKey = "recent" | "cost" | "messages";

export function sessionRoutes(state: AppState): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const project = c.req.query("project");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const q = c.req.query("q")?.toLowerCase();
    const sort = (c.req.query("sort") ?? "recent") as SortKey;
    const cursor = parsePositiveInt(c.req.query("cursor"), 0);
    const limit = Math.min(
      parsePositiveInt(c.req.query("limit"), DEFAULT_PAGE),
      MAX_PAGE,
    );

    let summaries = state.aggregates().map((agg) => state.summarize(agg));
    if (project) summaries = summaries.filter((s) => s.projectDir === project);
    // overlap test: the session's window [firstTs, lastTs] intersects [from, to]
    if (from) summaries = summaries.filter((s) => (s.lastTs ?? "") >= from);
    if (to) {
      summaries = summaries.filter(
        (s) => (s.firstTs ?? "").slice(0, to.length) <= to,
      );
    }
    if (q) {
      summaries = summaries.filter(
        (s) =>
          s.title?.toLowerCase().includes(q) ||
          s.sessionId.toLowerCase().includes(q) ||
          s.projectDir.toLowerCase().includes(q),
      );
    }

    summaries.sort((a, b) => {
      if (sort === "cost") return (b.costUsd ?? 0) - (a.costUsd ?? 0);
      if (sort === "messages") return b.messages - a.messages;
      return (a.lastTs ?? "") < (b.lastTs ?? "") ? 1 : -1;
    });

    const page = summaries.slice(cursor, cursor + limit);
    const nextCursor =
      cursor + limit < summaries.length ? cursor + limit : null;
    const response: SessionsPageResponse = {
      items: page,
      nextCursor,
      total: summaries.length,
    };
    return c.json(response);
  });

  app.get("/:id", (c) => {
    const found = state.findSession(c.req.param("id"));
    if (!found) return c.json({ error: "session not found" }, 404);
    const { agg } = found;
    const response: SessionDetailResponse = {
      ...state.summarize(agg),
      gitBranches: agg.gitBranches,
      versions: agg.versions,
      entrypoints: agg.entrypoints,
      counts: agg.counts,
      toolCallsByName: agg.toolCalls,
      usageByModel: agg.usageByModel,
      unknownTypes: agg.unknownTypes,
    };
    return c.json(response);
  });

  app.get("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const found = state.findSession(sessionId);
    if (!found) return c.json({ error: "session not found" }, 404);
    const cursor = parsePositiveInt(c.req.query("cursor"), 0);
    const limit = Math.min(
      parsePositiveInt(c.req.query("limit"), DEFAULT_MESSAGE_PAGE),
      MAX_PAGE,
    );
    const page: MessagesPageResponse = await readMessagePage(
      found.filePath,
      sessionId,
      state.config.cacheDir,
      cursor,
      limit,
      { redact: state.config.redact, pricingTable: state.config.pricingTable },
    );
    return c.json(page);
  });

  return app;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
