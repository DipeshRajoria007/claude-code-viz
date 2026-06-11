import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claudePaths,
  resolveCacheDir,
  resolveClaudeDir,
} from "../src/core/claudeDir.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveClaudeDir", () => {
  it("prefers the explicit --dir argument", () => {
    process.env.CLAUDE_CODE_VIZ_DIR = "/env/claude";
    expect(resolveClaudeDir("/explicit/claude")).toBe("/explicit/claude");
  });

  it("falls back to CLAUDE_CODE_VIZ_DIR", () => {
    process.env.CLAUDE_CODE_VIZ_DIR = "/env/claude";
    expect(resolveClaudeDir()).toBe("/env/claude");
  });

  it("defaults to ~/.claude", () => {
    delete process.env.CLAUDE_CODE_VIZ_DIR;
    expect(resolveClaudeDir()).toBe(join(homedir(), ".claude"));
  });
});

describe("resolveCacheDir", () => {
  it("prefers the explicit --cache-dir argument", () => {
    expect(resolveCacheDir("/explicit/cache")).toBe("/explicit/cache");
  });

  it("respects XDG_CACHE_HOME", () => {
    delete process.env.CLAUDE_CODE_VIZ_CACHE_DIR;
    process.env.XDG_CACHE_HOME = "/xdg/cache";
    expect(resolveCacheDir()).toBe(join("/xdg/cache", "claude-code-viz"));
  });

  it("defaults to ~/.cache/claude-code-viz", () => {
    delete process.env.CLAUDE_CODE_VIZ_CACHE_DIR;
    delete process.env.XDG_CACHE_HOME;
    expect(resolveCacheDir()).toBe(
      join(homedir(), ".cache", "claude-code-viz"),
    );
  });
});

describe("claudePaths allowlist", () => {
  it("exposes exactly the readable paths — settings files are absent", () => {
    const paths = claudePaths("/home/x/.claude");
    expect(Object.keys(paths).sort()).toEqual([
      "history",
      "projects",
      "root",
      "sessions",
      "statsCache",
      "tasks",
      "todos",
    ]);
    const values = Object.values(paths).join(" ");
    expect(values).not.toContain("settings");
    expect(values).not.toContain("credentials");
  });
});
