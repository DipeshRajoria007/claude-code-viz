import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Resolution and the structural file-access allowlist for the Claude data
 * directory. The visualizer reads ONLY the paths returned by claudePaths();
 * settings.json and other credential-bearing files are deliberately absent,
 * making them structurally unreachable from the rest of the codebase.
 */

export function resolveClaudeDir(explicit?: string): string {
  if (explicit) return resolve(explicit);
  const fromEnv = process.env.CLAUDE_CODE_VIZ_DIR;
  if (fromEnv) return resolve(fromEnv);
  return join(homedir(), ".claude");
}

export function resolveCacheDir(explicit?: string): string {
  if (explicit) return resolve(explicit);
  const fromEnv = process.env.CLAUDE_CODE_VIZ_CACHE_DIR;
  if (fromEnv) return resolve(fromEnv);
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache ? resolve(xdgCache) : join(homedir(), ".cache");
  return join(base, "claude-code-viz");
}

export interface ClaudePaths {
  root: string;
  /** projects/<dashified-path>/<session-uuid>.jsonl transcripts */
  projects: string;
  /** every prompt the user ever typed */
  history: string;
  /** Claude Code's own pre-aggregated daily activity */
  statsCache: string;
  todos: string;
  tasks: string;
  /** live session metadata (pid, cwd, status) */
  sessions: string;
}

/** The complete set of paths this tool is allowed to read. */
export function claudePaths(claudeDir: string): ClaudePaths {
  return {
    root: claudeDir,
    projects: join(claudeDir, "projects"),
    history: join(claudeDir, "history.jsonl"),
    statsCache: join(claudeDir, "stats-cache.json"),
    todos: join(claudeDir, "todos"),
    tasks: join(claudeDir, "tasks"),
    sessions: join(claudeDir, "sessions"),
  };
}
