# Changelog

## 0.2.0 — 2026-06-11

### Memory page

- New **Memory** section visualizing Claude Code's file-based memory (`projects/*/memory/*.md`)
- **Obsidian-style interactive knowledge graph** (default view): live force simulation, draggable nodes, cursor-anchored zoom and pan, glowing nodes sized by file size + link degree and colored by memory type, labels that fade in with zoom, hover highlights a node's neighborhood
- Cards view grouped by project with MEMORY.md index health (orphan entries, unindexed files)
- Memory detail slide-over: markdown rendering with **clickable `[[wiki-links]]`**, backlinks, and a deep-link from `originSessionId` into the session replay
- Tolerant frontmatter parser (handles colons in values, nested `metadata:` blocks, files without frontmatter); `[[link]]` resolution by frontmatter name or filename stem, cross-project
- Same guarantees as everything else: read-only, path-traversal-guarded body endpoint, secrets redacted server-side

## 0.1.0 — 2026-06-11

Initial release.

- `npx claude-code-viz` starts a local, read-only dashboard over `~/.claude`
- Overview: activity heatmap (merges scanned transcripts with Claude Code's own stats cache), totals, messages-over-time, recent sessions
- Session browser with search/filter/sort and full conversation replay (markdown, tool calls with Edit diffs, thinking blocks, subagent threads, per-message cost)
- Usage & cost analytics by day / project / model with cache hit rate
- Tools & agents analytics: tool call counts, hook success/failure + timing, model token share
- Incremental index cache: first scan of ~900 MB takes seconds, restarts are instant
- Security: 127.0.0.1-only binding, Host-header allowlist, structural file allowlist (settings/credentials unreachable), best-effort secret redaction, no telemetry (CI-enforced)
