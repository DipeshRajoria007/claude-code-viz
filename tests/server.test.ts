import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  MessagesPageResponse,
  MetaResponse,
  OverviewResponse,
  ProjectSummary,
  SessionDetailResponse,
  SessionsPageResponse,
  ToolsAnalyticsResponse,
  UsageBucket,
} from "../shared/api-types.js";
import { createServer, type Server } from "../src/server/index.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-dir", import.meta.url),
);
const BASIC_SESSION = "11111111-2222-3333-4444-555555555555";

let cacheDir: string;
let server: Server;

beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "ccv-server-"));
  server = createServer({
    claudeDir: FIXTURE_DIR,
    cacheDir,
    appVersion: "0.0.0-test",
    redact: true,
    webDir: join(cacheDir, "no-web-assets-here"),
  });
  server.state.startScan();
  await server.state.whenScanned();
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

async function get<T>(path: string): Promise<T> {
  const response = await server.app.request(path, {
    headers: { host: "127.0.0.1:4141" },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

describe("security", () => {
  it("rejects requests with an unexpected Host header (DNS rebinding)", async () => {
    const response = await server.app.request("/api/meta", {
      headers: { host: "evil.example.com" },
    });
    expect(response.status).toBe(403);
  });

  it("accepts localhost and [::1] hosts", async () => {
    for (const host of ["localhost:4141", "127.0.0.1", "[::1]:4141"]) {
      const response = await server.app.request("/api/meta", {
        headers: { host },
      });
      expect(response.status).toBe(200);
    }
  });
});

describe("GET /api/meta", () => {
  it("reports version, dirs and pricing date", async () => {
    const meta = await get<MetaResponse>("/api/meta");
    expect(meta.appVersion).toBe("0.0.0-test");
    expect(meta.claudeDir).toBe(FIXTURE_DIR);
    expect(meta.redact).toBe(true);
    expect(meta.pricingAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("scan endpoints", () => {
  it("reports an idle, completed scan", async () => {
    const status = await get<{ state: string; lastCompletedAt: string | null }>(
      "/api/scan/status",
    );
    expect(status.state).toBe("idle");
    expect(status.lastCompletedAt).not.toBeNull();
  });

  it("accepts a refresh request", async () => {
    const response = await server.app.request("/api/scan/refresh", {
      method: "POST",
      headers: { host: "127.0.0.1" },
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { started: boolean };
    expect(typeof body.started).toBe("boolean");
    await server.state.whenScanned();
  });
});

describe("GET /api/overview", () => {
  it("returns totals, daily activity, stats-cache fallback and recents", async () => {
    const overview = await get<OverviewResponse>("/api/overview");
    expect(overview.totals.sessions).toBe(3);
    expect(overview.totals.usage.input).toBeGreaterThan(0);
    expect(overview.daily.length).toBeGreaterThanOrEqual(2);
    expect(overview.statsCacheDaily).toHaveLength(3);
    expect(overview.recentSessions.length).toBeGreaterThan(0);
    const timestamps = overview.recentSessions.map((s) => s.lastTs ?? "");
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });
});

describe("GET /api/sessions", () => {
  it("lists all sessions with summaries", async () => {
    const page = await get<SessionsPageResponse>("/api/sessions");
    expect(page.total).toBe(3);
    const basic = page.items.find((s) => s.sessionId === BASIC_SESSION);
    expect(basic?.title).toBe("Fix flaky login test");
    expect(basic?.models).toEqual(["claude-opus-4-8"]);
    expect(basic?.costUsd).toBeGreaterThan(0);
  });

  it("filters by project", async () => {
    const page = await get<SessionsPageResponse>(
      "/api/sessions?project=-home-test-project",
    );
    expect(page.total).toBe(2);
  });

  it("searches titles", async () => {
    const page = await get<SessionsPageResponse>("/api/sessions?q=flaky");
    expect(page.total).toBe(1);
    expect(page.items[0]?.sessionId).toBe(BASIC_SESSION);
  });

  it("paginates with a cursor", async () => {
    const first = await get<SessionsPageResponse>("/api/sessions?limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(2);
    const second = await get<SessionsPageResponse>(
      `/api/sessions?limit=2&cursor=${first.nextCursor}`,
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns the full session detail", async () => {
    const detail = await get<SessionDetailResponse>(
      `/api/sessions/${BASIC_SESSION}`,
    );
    expect(detail.counts.user).toBe(1);
    expect(detail.counts.assistant).toBe(2);
    expect(detail.toolCallsByName).toEqual({ Read: 1 });
    expect(detail.usageByModel["claude-opus-4-8"]?.input).toBe(1500);
  });

  it("404s for unknown sessions", async () => {
    const response = await server.app.request("/api/sessions/nope", {
      headers: { host: "127.0.0.1" },
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /api/sessions/:id/messages", () => {
  it("replays the conversation in order", async () => {
    const page = await get<MessagesPageResponse>(
      `/api/sessions/${BASIC_SESSION}/messages`,
    );
    expect(page.total).toBe(8); // 8 records in the transcript
    expect(page.nextCursor).toBeNull();
    const roles = page.items.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
    expect(page.items[0]?.blocks[0]?.text).toContain("flaky login test");
    const toolUse = page.items[1]?.blocks.find((b) => b.kind === "tool_use");
    expect(toolUse?.toolName).toBe("Read");
  });
});

describe("analytics endpoints", () => {
  it("groups usage by day, project and model", async () => {
    const byDay = await get<UsageBucket[]>("/api/analytics/usage?groupBy=day");
    expect(byDay[0]?.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const byProject = await get<UsageBucket[]>(
      "/api/analytics/usage?groupBy=project",
    );
    expect(byProject.map((b) => b.key)).toContain("-home-test-project");
    const byModel = await get<UsageBucket[]>(
      "/api/analytics/usage?groupBy=model",
    );
    expect(byModel.map((b) => b.key)).toContain("claude-opus-4-8");
    const opus = byModel.find((b) => b.key === "claude-opus-4-8");
    expect(opus?.cacheHitRate).toBeGreaterThan(0);
  });

  it("reports tools, hooks and agents", async () => {
    const tools = await get<ToolsAnalyticsResponse>("/api/analytics/tools");
    expect(tools.tools.find((t) => t.name === "Read")?.count).toBe(1);
    expect(tools.hooks[0]?.name).toBe("SessionStart:startup");
  });

  it("lists projects", async () => {
    const projects = await get<ProjectSummary[]>("/api/projects");
    expect(projects).toHaveLength(2);
  });
});

describe("static serving", () => {
  it("serves a placeholder when web assets are missing", async () => {
    const response = await server.app.request("/", {
      headers: { host: "127.0.0.1" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("claude-code-viz");
  });

  it("404s unknown api routes as json, not html", async () => {
    const response = await server.app.request("/api/definitely-not-a-route", {
      headers: { host: "127.0.0.1" },
    });
    expect(response.status).toBe(404);
  });
});
