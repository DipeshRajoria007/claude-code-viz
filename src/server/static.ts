import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { Context, Hono } from "hono";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const PLACEHOLDER = `<!doctype html>
<html><head><title>claude-code-viz</title></head>
<body style="font-family: system-ui; padding: 4rem; background: #111; color: #eee">
<h1>claude-code-viz</h1>
<p>The server is running, but the dashboard assets were not found.
This happens in development — run the web build, or use the Vite dev server.</p>
<p>The API is live: try <a href="/api/meta" style="color:#7dd">/api/meta</a>.</p>
</body></html>`;

/**
 * Serve the built dashboard (dist/web) with an SPA fallback to index.html.
 * Hand-rolled instead of serve-static so the asset root can live inside the
 * installed package regardless of the process working directory.
 */
export function mountStatic(app: Hono, webDir: string): void {
  app.get("*", async (c) => serveFrom(webDir, c));
}

async function serveFrom(webDir: string, c: Context): Promise<Response> {
  const requestPath = decodeURIComponent(new URL(c.req.url).pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(webDir, safePath);
  if (!filePath.startsWith(webDir)) filePath = join(webDir, "index.html");

  let body: Buffer | null = await tryRead(filePath, safePath === "/");
  let servedPath = filePath;
  if (body === null) {
    servedPath = join(webDir, "index.html");
    body = await tryRead(servedPath, true);
  }
  if (body === null) return c.html(PLACEHOLDER);

  const type = CONTENT_TYPES[extname(servedPath)] ?? "application/octet-stream";
  c.header("Content-Type", type);
  const cacheable = servedPath.includes(`${join(webDir, "assets")}`);
  c.header(
    "Cache-Control",
    cacheable ? "public, max-age=31536000, immutable" : "no-cache",
  );
  return c.body(new Uint8Array(body));
}

async function tryRead(
  filePath: string,
  isDir: boolean,
): Promise<Buffer | null> {
  try {
    const target = isDir ? join(filePath, "index.html") : filePath;
    return await readFile(target);
  } catch {
    return null;
  }
}
