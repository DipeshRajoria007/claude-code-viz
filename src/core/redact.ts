/**
 * Best-effort scrubbing of secret-shaped strings from transcript content
 * before it is served to the dashboard. The server only ever listens on
 * 127.0.0.1, so this is defense in depth — not a guarantee. Patterns target
 * well-known token formats to keep false positives low.
 */
interface SecretPattern {
  kind: string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  {
    kind: "private-key",
    regex:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  },
  { kind: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{8,}/g },
  { kind: "openai-key", regex: /\bsk-[A-Za-z0-9]{32,}\b/g },
  {
    kind: "github-token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  },
  { kind: "github-pat", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "slack-token", regex: /\bxox[bpoas]-[A-Za-z0-9-]{8,}\b/g },
  { kind: "atlassian-token", regex: /\bATATT[A-Za-z0-9_=-]{20,}\b/g },
  { kind: "npm-token", regex: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  {
    kind: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  { kind: "bearer", regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const { kind, regex } of PATTERNS) {
    result = result.replace(regex, `[REDACTED:${kind}]`);
  }
  return result;
}

/**
 * Apply redaction to every string nested inside a JSON-ish value
 * (tool inputs, tool results). Returns a new value; never mutates.
 */
export function deepRedact(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(deepRedact);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = deepRedact(entry);
    }
    return result;
  }
  return value;
}
