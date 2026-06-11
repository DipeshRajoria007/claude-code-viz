import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Privacy guarantee, enforced: the server and core library must never make
 * outbound network requests. This walks every source file and fails on any
 * HTTP-client usage or non-local URL.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(ROOT, dir, name));
}

const FORBIDDEN = [
  { name: "fetch call", regex: /\bfetch\s*\(/ },
  { name: "http(s).request", regex: /\bhttps?\.(request|get)\s*\(/ },
  { name: "XMLHttpRequest", regex: /\bXMLHttpRequest\b/ },
  { name: "axios", regex: /\baxios\b/ },
  { name: "WebSocket client", regex: /\bnew WebSocket\s*\(/ },
  {
    name: "non-local URL",
    regex: /https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\])[a-z0-9]/i,
  },
];

describe("no outbound network calls in src/ or shared/", () => {
  const files = [...sourceFiles("src"), ...sourceFiles("shared")];

  it("finds source files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { name, regex } of FORBIDDEN) {
    it(`contains no ${name}`, () => {
      const offenders = files.filter((file) =>
        regex.test(readFileSync(file, "utf8")),
      );
      expect(offenders).toEqual([]);
    });
  }
});
