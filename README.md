# claude-code-viz

**A local web dashboard for your Claude Code data.**

Claude Code stores every conversation, tool call, and token count under `~/.claude` — but ships no way to look at any of it. `claude-code-viz` reads that directory (strictly read-only) and gives you a dashboard:

```sh
npx claude-code-viz
```

That's it. A local server starts on `127.0.0.1:4141` and your browser opens the dashboard.

## What you get

- **Overview** — GitHub-style activity heatmap, total sessions / messages / tokens / estimated cost, messages-over-time chart, recent sessions.
- **Session browser & replay** — every Claude Code conversation you've ever had, searchable and filterable by project; open any session and replay it with markdown rendering, collapsible tool calls (Edit shown as a diff), thinking blocks, and subagent threads.
- **Usage & cost analytics** — estimated spend per day / project / model computed from the exact token counts in your transcripts, including the cache-read vs input split and your cache hit rate (cache reads are ~10× cheaper — this number is actionable).
- **Tools & agents** — which tools Claude uses most, hook success/failure rates with timing, subagent usage, token share per model.

Every dollar figure is labeled an **estimate**: it's computed from your token counts × a bundled pricing table (each entry carries the date it was last verified). Unknown models are surfaced as unpriced, never silently priced at $0.

## Privacy & security

This tool is built for paranoid defaults, because `~/.claude` contains your entire conversation history:

- **100% local.** The server binds `127.0.0.1` only — there is no flag to widen it. A Host-header allowlist guards against DNS rebinding. A CI-enforced test fails the build if any outbound network call appears in the source.
- **Strictly read-only** over `~/.claude`. The only writes are its own index cache in `~/.cache/claude-code-viz`.
- **Structural allowlist.** Only `projects/`, `history.jsonl`, `stats-cache.json`, `todos/`, `tasks/`, and `sessions/` are readable by the code. `settings.json` — which can contain MCP credentials — is unreachable by construction.
- **Best-effort redaction.** Secret-shaped strings in transcripts (Anthropic/OpenAI/GitHub/AWS/Slack/Atlassian/npm tokens, JWTs, `Bearer` headers, PEM keys) are replaced with `[REDACTED:kind]` before being served. Disable with `--no-redact` if you need the raw text. Redaction is pattern-based and best-effort — the localhost-only server is the real boundary.
- **No telemetry.** Nothing is collected, nothing phones home.

## Options

```text
claude-code-viz [options]

--dir <path>        Claude data directory        (default: ~/.claude)
--port <number>     Port to listen on            (default: 4141)
--no-open           Don't open the browser
--cache-dir <path>  Index cache directory        (default: ~/.cache/claude-code-viz)
--pricing <path>    JSON file with pricing overrides
--no-redact         Disable secret redaction
-v, --version       Print version
-h, --help          Show help
```

Environment variables `CLAUDE_CODE_VIZ_DIR` and `CLAUDE_CODE_VIZ_CACHE_DIR` work too.

### Pricing overrides

Prices change. If the bundled table is stale (check the tooltip on any cost figure), pass your own:

```json
[
  {
    "match": "claude-opus-4",
    "displayName": "Claude Opus 4.x",
    "inputPerMTok": 5,
    "outputPerMTok": 25,
    "cacheWrite5mPerMTok": 6.25,
    "cacheWrite1hPerMTok": 10,
    "cacheReadPerMTok": 0.5,
    "asOf": "2026-06-04"
  }
]
```

```sh
claude-code-viz --pricing ./my-prices.json
```

Entries are matched by model-id prefix, first match wins, and your overrides are checked before the bundled table.

## How it works

On first run, the scanner stream-parses every transcript under `~/.claude/projects/` once and stores a small per-session aggregate (token usage by model and by day, tool counts, title, timestamps) in an index cache. On a ~900 MB / 1,500-session directory this takes a few seconds; afterwards only files whose `mtime`/`size` changed are re-parsed, so restarts are instant. Opening a session builds sparse byte offsets so even 60,000-line transcripts page in milliseconds with O(page) memory.

The transcript format is undocumented and changes between Claude Code versions. The parser never hard-fails a file: malformed lines are counted and skipped, unknown record types are tallied and surfaced in the UI, and the index schema is versioned so upgrades rebuild cleanly.

## Development

```sh
npm install
npm run typecheck   # node + web tsconfig projects
npm run lint        # biome
npm test            # vitest — synthetic fixtures only, no real user data
npm run build       # tsup (CLI) + vite (dashboard) → dist/
node dist/cli.js --dir tests/fixtures/claude-dir --no-open   # run against fixtures
npm run dev:web     # vite dev server with /api proxied to :4141
```

Contributions welcome. Every change lands via PR with CI (typecheck, lint, tests on Node 20 and 22, build, server smoke test).

## License

MIT
