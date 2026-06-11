import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { resolveCacheDir, resolveClaudeDir } from "./core/claudeDir.js";
import { mergePricingTables } from "./core/pricing.js";
import type { ModelPricing } from "./core/pricing-data.js";
import { createServer } from "./server/index.js";

const HELP = `claude-code-viz — local dashboard for your Claude Code data (~/.claude)

Usage:
  claude-code-viz [options]

Options:
  --dir <path>        Claude data directory (default: ~/.claude)
  --port <number>     Port to listen on (default: 4141)
  --no-open           Don't open the browser automatically
  --cache-dir <path>  Index cache directory (default: ~/.cache/claude-code-viz)
  --pricing <path>    JSON file with pricing overrides
  --no-redact         Disable secret redaction in served transcripts
  -v, --version       Print version
  -h, --help          Show this help

The server binds 127.0.0.1 only. Your data never leaves your machine.
`;

export function getVersion(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}

function loadPricingOverrides(
  path: string | undefined,
): ModelPricing[] | undefined {
  if (!path) return undefined;
  const overrides = JSON.parse(readFileSync(path, "utf8")) as ModelPricing[];
  if (!Array.isArray(overrides)) {
    throw new Error(`--pricing file must contain a JSON array: ${path}`);
  }
  return mergePricingTables(overrides);
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  const [bin, ...args] = command;
  if (!bin) return;
  try {
    spawn(bin, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // opening the browser is a convenience, never a failure
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      port: { type: "string" },
      open: { type: "boolean", default: true },
      "cache-dir": { type: "string" },
      pricing: { type: "string" },
      redact: { type: "boolean", default: true },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
    allowNegative: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.version) {
    console.log(getVersion());
    return;
  }

  const claudeDir = resolveClaudeDir(values.dir);
  const cacheDir = resolveCacheDir(values["cache-dir"]);
  const port = values.port ? Number.parseInt(values.port, 10) : 4141;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${values.port}`);
    process.exitCode = 1;
    return;
  }

  let pricingTable: ModelPricing[] | undefined;
  try {
    pricingTable = loadPricingOverrides(values.pricing);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const webDir = join(dirname(fileURLToPath(import.meta.url)), "web");
  const { app, state } = createServer({
    claudeDir,
    cacheDir,
    appVersion: getVersion(),
    redact: values.redact,
    pricingTable,
    webDir,
  });

  const server = serve(
    { fetch: app.fetch, port, hostname: "127.0.0.1" },
    (info) => {
      const url = `http://127.0.0.1:${info.port}`;
      console.log(`claude-code-viz v${getVersion()}`);
      console.log(`Reading:   ${claudeDir} (read-only)`);
      console.log(`Dashboard: ${url}`);
      state.startScan();
      if (values.open) openBrowser(url);
    },
  );
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is in use — try --port <number>.`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  });
}

main();
