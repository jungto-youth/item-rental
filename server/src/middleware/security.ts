import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "../types";
import { MAX_PHOTO_UPLOAD_BYTES } from "../../../shared/photo-limits";

type AppEnv = { Bindings: Bindings; Variables: Variables };
export const MAX_API_BODY_BYTES = 32 * 1024;
export const MAX_PHOTO_BODY_BYTES = MAX_PHOTO_UPLOAD_BYTES + 64 * 1024;

export function canonicalAuthRequest(request: Request): Request {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("host", url.host);
  headers.delete("x-forwarded-host");
  headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
  return new Request(request, { headers });
}

export const apiSecurityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
};

export const guardApiRequest: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (typeof c.env.AUTH_SECRET !== "string" || c.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET은 32자 이상의 무작위 값으로 설정해야 합니다");
  }
  const writes = c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS";
  if (writes && !c.req.path.startsWith("/api/auth/")) {
    // Compare the full origin, including scheme. Host/forwarded headers are not authority.
    if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "bad_origin" }, 403);
  }
  if (!c.req.raw.body) return next();
  const maximum = c.req.method === "POST" && /^\/api\/admin\/items\/[^/]+\/photos$/.test(c.req.path)
    ? MAX_PHOTO_BODY_BYTES : MAX_API_BODY_BYTES;
  const claimed = c.req.header("content-length");
  if (claimed !== undefined) {
    if (!/^\d+$/.test(claimed)) return c.json({ error: "bad_content_length" }, 400);
    if (Number(claimed) > maximum) return c.json({ error: "request_too_large" }, 413);
  }
  // Count actual bytes too: absent or misleading Content-Length cannot bypass the limit.
  const reader = c.req.raw.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        void reader.cancel().catch(() => {});
        return c.json({ error: "request_too_large" }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  c.req.raw = new Request(c.req.raw, { headers, body: bytes });
  await next();
};
