import { Hono } from "hono";
import { analyticsRoutes, projectRoutes } from "./routes/analytics.js";
import { memoryRoutes } from "./routes/memory.js";
import { metaRoutes } from "./routes/meta.js";
import { overviewRoutes } from "./routes/overview.js";
import { scanRoutes } from "./routes/scan.js";
import { sessionRoutes } from "./routes/sessions.js";
import { hostGuard } from "./security.js";
import { type AppConfig, AppState } from "./state.js";
import { mountStatic } from "./static.js";

export interface CreateServerOptions extends AppConfig {
  /** Directory holding the built dashboard (dist/web). */
  webDir: string;
}

export interface Server {
  app: Hono;
  state: AppState;
}

/** Build the Hono app without listening — the CLI binds it, tests app.request() it. */
export function createServer(options: CreateServerOptions): Server {
  const state = new AppState(options);
  const app = new Hono();

  app.use("*", hostGuard());
  app.route("/api/meta", metaRoutes(state));
  app.route("/api/scan", scanRoutes(state));
  app.route("/api/overview", overviewRoutes(state));
  app.route("/api/sessions", sessionRoutes(state));
  app.route("/api/projects", projectRoutes(state));
  app.route("/api/analytics", analyticsRoutes(state));
  app.route("/api/memory", memoryRoutes(state));
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
  mountStatic(app, options.webDir);

  return { app, state };
}
