import { describe, expect, it } from "vitest";
import { deepRedact, redactSecrets } from "../src/core/redact.js";

describe("redactSecrets", () => {
  it.each([
    ["anthropic-key", "key is sk-ant-api03-aaaaBBBBcccc1234"],
    ["openai-key", "key is sk-aaaabbbbccccddddeeeeffffgggghhhh12345678"],
    ["github-token", "token ghp_abcdefghijklmnopqrstuvwxyz123456"],
    ["github-pat", "github_pat_11AAAAAAA0abcdefghijklmnop"],
    ["aws-access-key", "AKIAIOSFODNN7EXAMPLE"],
    ["slack-token", "xoxb-1234567890-abcdefghijk"],
    ["atlassian-token", "ATATT3xFfGF0aBcDeFgHiJkLmNoPqRsTuV"],
    ["npm-token", "npm_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpM"],
    ["bearer", "Authorization: Bearer abc123def456ghi789jkl"],
  ])("redacts %s tokens", (kind, text) => {
    const result = redactSecrets(text);
    expect(result).toContain(`[REDACTED:${kind}]`);
  });

  it("redacts PEM private key blocks including multiline bodies", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234
abcd
-----END RSA PRIVATE KEY-----`;
    expect(redactSecrets(`here:\n${pem}\nafter`)).toBe(
      "here:\n[REDACTED:private-key]\nafter",
    );
  });

  it.each([
    "a normal sentence about tasks",
    "uuid 880ce27f-8911-4da5-af71-02896e0e0429",
    "short prefix sk-ant",
    "the word Bearer alone",
    "file path /home/user/.npm/config",
    "skiing is fun: sk-i-am-not-a-key",
    "AKIA but too short AKIA123",
  ])("leaves benign text untouched: %s", (text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it("redacts multiple secrets in one string", () => {
    const text =
      "slack xoxb-111111111-aaaaaaaaaa and gh ghp_zzzzzzzzzzzzzzzzzzzzzzzzz11111";
    const result = redactSecrets(text);
    expect(result).not.toContain("xoxb-");
    expect(result).not.toContain("ghp_");
  });
});

describe("deepRedact", () => {
  it("redacts strings nested in objects and arrays without mutating input", () => {
    const input = {
      command: "curl -H 'Authorization: Bearer abc123def456ghi789jkl'",
      args: ["xoxb-1234567890-abcdefghijk", 42, null],
      nested: { token: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const result = deepRedact(input) as typeof input;

    expect(result.command).toContain("[REDACTED:bearer]");
    expect(result.args[0]).toBe("[REDACTED:slack-token]");
    expect(result.args[1]).toBe(42);
    expect(result.nested.token).toBe("[REDACTED:github-token]");
    expect(input).toEqual(snapshot);
  });
});
