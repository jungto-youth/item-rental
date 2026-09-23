// 로그인 허용 예외 이메일 도메인 서비스 — 목록/추가/삭제 SQL 을 직접 소유
// 구글 OAuth 로그인 게이트 보조 — @jungto.org 외 계정의 로그인 허용을 어드민 화면에서 관리.
// env 변수 AUTH_ALLOWED_EMAILS 는 비상용 폴백으로 병행 사용된다 (auth.ts).
import type { Sql } from "../db";

// 저장/조회 전 정규화 — members.email 과 동일 기준 (trim + lowercase)
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AllowedEmail = {
  id: string;
  email: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

// 목록 — 최근 등록순
export async function listAllowedEmails(db: Sql): Promise<AllowedEmail[]> {
  return (await db.query(
    `SELECT id, email, note, created_by, created_at
       FROM allowed_emails
      ORDER BY created_at DESC`,
  )) as AllowedEmail[];
}

// 추가 결과 — duplicate: 이미 등록된 이메일 (409)
export type AddAllowedEmailResult = { ok: true } | { error: "duplicate" };

// 추가 — UNIQUE 충돌을 멱등 처리하지 않고 명시적 거부로 돌려준다 (라우트가 409 응답)
export async function addAllowedEmail(
  db: Sql,
  email: string,
  opts?: { note?: string; createdBy?: string },
): Promise<AddAllowedEmailResult> {
  const rows = (await db.query(
    `INSERT INTO allowed_emails (email, note, created_by)
     VALUES (?1, ?2, ?3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [normalizeEmail(email), opts?.note?.trim() || null, opts?.createdBy ?? null],
  )) as { id: string }[];
  if (rows.length === 0) return { error: "duplicate" };
  return { ok: true };
}

// 삭제 결과 — not_found: 없는 id (404)
export type DeleteAllowedEmailResult = { ok: true } | { error: "not_found" };

export async function deleteAllowedEmail(
  db: Sql,
  id: string,
): Promise<DeleteAllowedEmailResult> {
  const rows = (await db.query(
    "DELETE FROM allowed_emails WHERE id = ?1 RETURNING id",
    [id],
  )) as { id: string }[];
  if (rows.length === 0) return { error: "not_found" };
  return { ok: true };
}
