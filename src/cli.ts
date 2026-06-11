import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

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
`;

export function getVersion(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}

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
} else if (values.version) {
  console.log(getVersion());
} else {
  // Server wiring lands in a later PR; for now the CLI only reports itself.
  console.log(`claude-code-viz v${getVersion()} — server coming soon.`);
}
