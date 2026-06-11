import type { MiddlewareHandler } from "hono";

/**
 * DNS-rebinding guard: the server only ever binds 127.0.0.1, but a malicious
 * site could point its own hostname at 127.0.0.1 and read responses cross
 * origin. Rejecting unexpected Host headers closes that hole.
 */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function hostGuard(): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host");
    if (!host || !ALLOWED_HOSTS.has(stripPort(host))) {
      return c.text("Forbidden", 403);
    }
    await next();
  };
}

function stripPort(host: string): string {
  // IPv6 literals look like [::1]:4141
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}
