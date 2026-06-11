import { describe, expect, it } from "vitest";
import { normalizeRecord } from "../src/core/normalize.js";
import {
  assistantRecord,
  summaryRecord,
  textBlock,
  toolResultBlock,
  toolUseBlock,
  usage,
  userRecord,
} from "./helpers/build-record.js";

const OPTS = { redact: true };

describe("normalizeRecord", () => {
  it("turns a string user message into a single text block", () => {
    const message = normalizeRecord(userRecord("hello there"), 0, OPTS);
    expect(message?.role).toBe("user");
    expect(message?.blocks).toEqual([{ kind: "text", text: "hello there" }]);
    expect(message?.usage).toBeNull();
  });

  it("returns null for non-conversation records", () => {
    expect(normalizeRecord(summaryRecord("a title"), 0, OPTS)).toBeNull();
  });

  it("normalizes assistant content blocks, usage and cost", () => {
    const record = assistantRecord(
      [
        textBlock("Running the test."),
        toolUseBlock("Bash", { command: "npm test" }),
      ],
      { usage: usage({ input_tokens: 1_000_000 }) },
    );
    const message = normalizeRecord(record, 3, OPTS);
    expect(message?.index).toBe(3);
    expect(message?.model).toBe("claude-opus-4-8");
    expect(message?.blocks[0]).toEqual({
      kind: "text",
      text: "Running the test.",
    });
    expect(message?.blocks[1]?.kind).toBe("tool_use");
    expect(message?.blocks[1]?.toolName).toBe("Bash");
    expect(message?.blocks[1]?.toolInput).toEqual({ command: "npm test" });
    expect(message?.usage?.input).toBe(1_000_000);
    // $5/MTok input + 50 output tokens of the default usage()
    expect(message?.costUsd).toBeGreaterThan(4.9);
  });

  it("flattens tool_result content arrays into display text", () => {
    const record = userRecord([
      toolResultBlock("toolu_1", [{ type: "text", text: "line one" }], true),
    ]);
    const message = normalizeRecord(record, 1, OPTS);
    expect(message?.blocks[0]?.kind).toBe("tool_result");
    expect(message?.blocks[0]?.text).toBe("line one");
    expect(message?.blocks[0]?.isError).toBe(true);
  });

  it("redacts secrets in text and deep inside tool inputs", () => {
    const record = assistantRecord([
      textBlock("your key is xoxb-1234567890-abcdefghijk"),
      toolUseBlock("Bash", {
        command: "export GH=ghp_abcdefghijklmnopqrstuvwxyz123456",
      }),
    ]);
    const message = normalizeRecord(record, 0, { redact: true });
    expect(message?.blocks[0]?.text).toContain("[REDACTED:slack-token]");
    const input = message?.blocks[1]?.toolInput as { command: string };
    expect(input.command).toContain("[REDACTED:github-token]");
  });

  it("keeps content verbatim when redaction is off", () => {
    const record = assistantRecord([textBlock("xoxb-1234567890-abcdefghijk")]);
    const message = normalizeRecord(record, 0, { redact: false });
    expect(message?.blocks[0]?.text).toBe("xoxb-1234567890-abcdefghijk");
  });

  it("maps unknown block types to kind=unknown with the raw type preserved", () => {
    const record = assistantRecord([{ type: "crystal", facets: 12 }]);
    const message = normalizeRecord(record, 0, OPTS);
    expect(message?.blocks[0]).toEqual({ kind: "unknown", rawType: "crystal" });
  });

  it("marks sidechain and meta records", () => {
    const message = normalizeRecord(
      userRecord("side", { isSidechain: true, isMeta: true }),
      0,
      OPTS,
    );
    expect(message?.isSidechain).toBe(true);
    expect(message?.isMeta).toBe(true);
  });
});
