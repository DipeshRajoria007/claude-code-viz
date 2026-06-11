import { Hono } from "hono";
import type { MetaResponse } from "../../../shared/api-types.js";
import { PRICING_AS_OF } from "../../core/pricing-data.js";
import type { AppState } from "../state.js";

export function metaRoutes(state: AppState): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    const response: MetaResponse = {
      appVersion: state.config.appVersion,
      claudeDir: state.config.claudeDir,
      cacheDir: state.config.cacheDir,
      pricingAsOf: PRICING_AS_OF,
      redact: state.config.redact,
    };
    return c.json(response);
  });
  return app;
}
