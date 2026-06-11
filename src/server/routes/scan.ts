import { Hono } from "hono";
import type { AppState } from "../state.js";

export function scanRoutes(state: AppState): Hono {
  const app = new Hono();
  app.get("/status", (c) => c.json(state.scanStatus()));
  app.post("/refresh", (c) => {
    const started = state.startScan();
    return c.json({ started }, 202);
  });
  return app;
}
