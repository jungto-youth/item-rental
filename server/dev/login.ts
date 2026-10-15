// Development-only module. The production entry never imports this directory.
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { decode, encode } from "@auth/core/jwt";
import { getDb, type Sql } from "../src/db";
import type { Bindings, Variables, SessionUser } from "../src/types";
import { getStandardSessionUser, readSessionToken } from "../src/middleware/auth";
import { apiSecurityHeaders, guardApiRequest } from "../src/middleware/security";

export type DevBindings = Bindings & { DEV_LOGIN_CODE?: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
export const DEV_ADMIN_ID = "local-photo-test-admin";

function localHost(request: Request): boolean {
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "[::1]") return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function accessCode(env: DevBindings): string | null {
  const code = env.DEV_LOGIN_CODE;
  return code && /^[A-Za-z0-9_-]{32,128}$/.test(code) ? code : null;
}

async function digest(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function ensureDevAdmin(db: Sql): Promise<string> {
  await db.query(
    `INSERT INTO members (id, email, name, phone, role)
     VALUES (?1, ?2, ?3, ?4, 'admin')
     ON CONFLICT (id) DO UPDATE SET
       email = excluded.email, name = excluded.name, phone = excluded.phone, role = 'admin',
       deactivated_at = NULL, registration_deleted_at = NULL`,
    [DEV_ADMIN_ID, "photo-test-admin@example.invalid", "로컬 테스트 관리자", "010-0000-0000"],
  );
  return DEV_ADMIN_ID;
}

export async function resolveDevelopmentSession(c: AppContext): Promise<SessionUser | null> {
  const standard = await getStandardSessionUser(c);
  if (standard) return standard;
  const code = accessCode(c.env as DevBindings);
  if (!code || !localHost(c.req.raw)) return null;
  const found = readSessionToken(c);
  if (!found) return null;
  try {
    const payload = await decode({ token: found.token, salt: found.salt, secret: c.env.AUTH_SECRET });
    if (payload?.sub !== DEV_ADMIN_ID || payload.local_test !== true || typeof payload.dev_code_hash !== "string") return null;
    if (!sameDigest(payload.dev_code_hash, await digest(code))) return null;
  } catch { return null; }
  const rows = await getDb(c.env).query<SessionUser>(
     `SELECT id, email, name, phone, role, deactivated_at FROM members
      WHERE id = ?1 AND deactivated_at IS NULL AND registration_deleted_at IS NULL`,
    [DEV_ADMIN_ID],
  );
  return rows[0] ?? null;
}

export function createDevLoginRoute() {
  const route = new Hono<{ Bindings: DevBindings; Variables: Variables }>();
  let failures = 0;
  let windowStarted = 0;
  route.use("*", apiSecurityHeaders, guardApiRequest);
  route.get("/", c => {
    if (!localHost(c.req.raw)) return c.json({ error: "not_found" }, 404);
    return c.json({ enabled: true, configured: !!accessCode(c.env) });
  });
  route.post("/", async c => {
    if (!localHost(c.req.raw)) return c.json({ error: "not_found" }, 404);
    const configured = accessCode(c.env);
    if (!configured) return c.json({ error: "dev_login_not_configured" }, 503);
    const now = Date.now();
    if (now - windowStarted >= 60_000) { failures = 0; windowStarted = now; }
    if (failures >= 5) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((windowStarted + 60_000 - now) / 1000))));
      return c.json({ error: "too_many_attempts" }, 429);
    }
    const body = await c.req.json().catch(() => ({})) as { code?: unknown };
    const expected = await digest(configured);
    if (typeof body.code !== "string" || body.code.length > 128 || !sameDigest(await digest(body.code), expected)) {
      failures++;
      return c.json({ error: "invalid_access_code" }, 401);
    }
    failures = 0;
    const id = await ensureDevAdmin(getDb(c.env));
    const secure = new URL(c.req.url).protocol === "https:";
    const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
    const maxAge = 8 * 60 * 60;
    const token = await encode({
      secret: c.env.AUTH_SECRET, salt: name, maxAge,
      token: { sub: id, local_test: true, dev_code_hash: expected },
    });
    setCookie(c, name, token, { httpOnly: true, sameSite: "Lax", path: "/", secure, maxAge });
    return c.json({ ok: true });
  });
  return route;
}
