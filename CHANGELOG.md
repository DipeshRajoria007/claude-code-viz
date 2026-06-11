# Changelog

## 0.1.0 — 2026-06-11

Initial release.

- `npx claude-code-viz` starts a local, read-only dashboard over `~/.claude`
- Overview: activity heatmap (merges scanned transcripts with Claude Code's own stats cache), totals, messages-over-time, recent sessions
- Session browser with search/filter/sort and full conversation replay (markdown, tool calls with Edit diffs, thinking blocks, subagent threads, per-message cost)
- Usage & cost analytics by day / project / model with cache hit rate
- Tools & agents analytics: tool call counts, hook success/failure + timing, model token share
- Incremental index cache: first scan of ~900 MB takes seconds, restarts are instant
- Security: 127.0.0.1-only binding, Host-header allowlist, structural file allowlist (settings/credentials unreachable), best-effort secret redaction, no telemetry (CI-enforced)
