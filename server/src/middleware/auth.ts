import type { Context, Next } from "hono";
import { decode } from "@auth/core/jwt";
import type { Bindings, SessionUser, Variables } from "../types";
import { getDb, type Sql } from "../db";

// SPEC §8 — requireAuth / requireAdmin
// JWT 서명 검증 후 members를 1회 조회해 최신 role/탈퇴 여부를 반영한다.
// 탈퇴한 회원(deactivated_at IS NOT NULL)은 세션을 버려 즉시 접근 차단한다.
// (무상태 JWT + 권한 변경 즉시 반영 — 재로그인 불필요)
const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

function readSessionToken(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): { token: string; salt: string } | null {
  const cookie = c.req.header("cookie") ?? "";
  for (const name of COOKIE_NAMES) {
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return { token: decodeURIComponent(m[1]), salt: name };
  }
  return null;
}

type JwtPayload = { sub?: string };

// 세션 사용자 조회 (없으면 null) — /api/me 등 401 대신 null이 필요한 곳에서 사용
export async function getSessionUser(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<SessionUser | null> {
  const found = readSessionToken(c);
  if (!found) return null;
  let payload: JwtPayload | undefined;
  try {
    payload = (await decode({
      token: found.token,
      secret: c.env.AUTH_SECRET,
      salt: found.salt,
    })) as JwtPayload | undefined;
  } catch {
    return null;
  }
  if (!payload?.sub) return null;

  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `SELECT id, email, name, phone, role, deactivated_at FROM members WHERE id = $1 AND deactivated_at IS NULL`,
    [payload.sub],
  )) as SessionUser[];
  return rows[0] ?? null;
}

export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
}

// admin 전용 — 운영 관리 + 관리자 지정/해제 (관리자 관리)
export async function requireAdmin(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
  c.set("user", user);
  await next();
}
