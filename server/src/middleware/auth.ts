import type { Context, Next } from "hono";
import { decode } from "@auth/core/jwt";
import type { Bindings, SessionUser, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { ALLOWED_DOMAIN, envAllowedEmails } from "../auth";

// requireAuth / requireAdmin
// JWT 서명 검증 후 members를 1회 조회해 최신 role/탈퇴 여부를 반영한다.
// 탈퇴한 회원(deactivated_at IS NOT NULL)은 세션을 버려 즉시 접근 차단한다.
// (무상태 JWT + 권한 변경 즉시 반영 — 재로그인 불필요)
const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

export function readSessionToken(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): { token: string; salt: string } | null {
  const cookie = c.req.header("cookie") ?? "";
  for (const name of COOKIE_NAMES) {
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) {
      try { return { token: decodeURIComponent(m[1]), salt: name }; }
      catch { return null; }
    }
  }
  return null;
}

type JwtPayload = { sub?: string; local_test?: unknown; dev_code_hash?: unknown };

// 세션 사용자 조회 (없으면 null) — /api/me 등 401 대신 null이 필요한 곳에서 사용
export async function getSessionUser(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<SessionUser | null> {
  // A separate entry point can inject a resolver; HTTP headers/env cannot set context variables.
  const resolver = c.get("sessionUserResolver");
  return resolver ? resolver(c) : getStandardSessionUser(c);
}

export async function getStandardSessionUser(
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
  if (typeof payload?.sub !== "string" || !payload.sub) return null;
  // Production always rejects development and legacy test cookies, regardless of build flags.
  if (payload.local_test !== undefined || payload.dev_code_hash !== undefined || payload.sub === "local-photo-test-admin") return null;

  // 로그인 허용 범위를 매 요청에 다시 본다 — 로그인 때만 보면 허용 목록에서 지운 예외 계정이
  // 남은 세션(최대 30일)으로 계속 들어온다. 판정은 signIn 과 같다: 정토회 도메인 → DB 허용 목록
  // → env 예외 목록. allowed_emails 는 소문자로 저장되므로 회원 이메일도 소문자로 비교한다.
  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `SELECT id, email, name, phone, affiliation, role, deactivated_at FROM members
     WHERE id = ?1 AND deactivated_at IS NULL AND registration_deleted_at IS NULL
       AND (lower(email) LIKE '%' || ?2
            OR lower(email) IN (SELECT email FROM allowed_emails)
            OR lower(email) IN (SELECT value FROM json_each(?3)))`,
    [payload.sub, ALLOWED_DOMAIN, JSON.stringify(envAllowedEmails(c.env))],
  )) as SessionUser[];
  return rows[0] ?? null;
}

export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
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
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
  c.set("user", user);
  await next();
}
