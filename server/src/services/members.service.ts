// 회원(Member) 도메인 서비스 — 목록/탈퇴/역할 SQL 을 직접 소유
// SPEC §4.1·§4.4 — 소프트 삭제(이력 보존), 마지막 관리자 보호
import type { Sql } from "../db";
import type { Role } from "../types";

// 목록 — 최근 가입순
export async function listMembers(db: Sql) {
  return db.query(
    `SELECT id, email, name, phone, role, deactivated_at, created_at
       FROM members
      ORDER BY created_at DESC`,
  );
}

// 탈퇴 결과 — last_admin: 마지막 관리자 보호 (409)
export type WithdrawResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "last_admin" };

// 탈퇴 처리 — 관리자가 활성 회원을 탈퇴시킨다. 약관이 회원에게 '탈퇴는 관리자에게 요청'이라
// 안내하는데 처리 수단이 없어 신설(§4.1, v3.1). 소프트 삭제 — 대여 이력 보존 위해 행 삭제 대신
// deactivated_at 기록(재가입 경로는 없고 복구도 안 함 — 탈퇴는 되돌릴 수 없다). 마지막 관리자
// 보호는 역할 핸들러와 같은 기준.
export async function withdrawMember(
  db: Sql,
  memberId: string,
): Promise<WithdrawResult> {
  const found = (await db.query("SELECT id, role FROM members WHERE id = $1", [
    memberId,
  ])) as {
    id: string;
    role: string;
  }[];
  if (found.length === 0) return { error: "not_found" };
  if (found[0].role === "admin") {
    const cnt = (await db.query(
      `SELECT COUNT(*)::int AS n FROM members WHERE role = 'admin' AND deactivated_at IS NULL`,
    )) as { n: number }[];
    if (cnt[0].n <= 1) return { error: "last_admin" };
  }
  await db.query(`UPDATE members SET deactivated_at = now() WHERE id = $1`, [
    memberId,
  ]);
  return { ok: true };
}

// 역할 지정/해제 결과
export type RoleResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "last_admin" };

// 역할 지정/해제 — admin ↔ user (검증은 라우트, v3.2)
export async function setMemberRole(
  db: Sql,
  memberId: string,
  role: Role,
): Promise<RoleResult> {
  const found = (await db.query(
    "SELECT id, role FROM members WHERE id = $1",
    [memberId],
  )) as {
    id: string;
    role: Role;
  }[];
  if (found.length === 0) return { error: "not_found" };
  const target = found[0];
  // 마지막 관리자 보호 — 해임하면 관리 기능 사용 불가 (본인 포함)
  if (target.role === "admin" && role !== "admin") {
    const cnt = (await db.query(
      `SELECT COUNT(*)::int AS n FROM members WHERE role = 'admin'`,
    )) as {
      n: number;
    }[];
    if (cnt[0].n <= 1) return { error: "last_admin" };
  }
  await db.query("UPDATE members SET role = $1 WHERE id = $2", [
    role,
    memberId,
  ]);
  return { ok: true };
}
