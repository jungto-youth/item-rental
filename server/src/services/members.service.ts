// 회원(Member) 도메인 서비스 — 목록/탈퇴/역할 SQL 을 직접 소유
// 소프트 삭제(이력 보존), 마지막 관리자 보호
import { SQL_NOW, type Sql } from "../db";
import type { AdminMember } from "../../../shared/api-types";
import type { Role } from "../types";

// 목록 — 최근 가입순
export async function listMembers(db: Sql): Promise<AdminMember[]> {
  return (await db.query(
    `SELECT id, email, name, phone, role, deactivated_at, created_at
       FROM members
      ORDER BY created_at DESC`,
  )) as AdminMember[];
}

// 탈퇴 결과 — last_admin: 마지막 관리자 보호 (409)
export type WithdrawResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "last_admin" };

// 탈퇴 처리 — 관리자가 활성 회원을 탈퇴시킨다. 약관이 회원에게 '탈퇴는 관리자에게 요청'이라
// 안내하는데 처리 수단이 없어 신설. 소프트 삭제 — 대여 이력 보존 위해 행 삭제 대신
// deactivated_at 기록(재가입 경로는 없고 복구도 안 함 — 탈퇴는 되돌릴 수 없다). 마지막 관리자
// 보호는 역할 핸들러와 같은 기준.
// 마지막 관리자 보호는 COUNT-then-UPDATE 두 쿼리로 나누면 동시 해임 레이스로 관리자가 0이 될 수
// 있어, 가드를 UPDATE WHERE 절 안에 넣어 단일 문장으로 원자 판정한다 (대여 가드 INSERT와 같은 방식).
export async function withdrawMember(
  db: Sql,
  memberId: string,
): Promise<WithdrawResult> {
  const rows = (await db.query(
    `UPDATE members SET deactivated_at = ${SQL_NOW}
      WHERE id = ?1
        AND (role <> 'admin'
             OR (SELECT COUNT(*) FROM members x
                  WHERE x.role = 'admin' AND x.deactivated_at IS NULL
                    AND x.id <> members.id) >= 1)
      RETURNING id`,
    [memberId],
  )) as { id: string }[];
  if (rows.length > 0) return { ok: true };
  const found = (await db.query(`SELECT id FROM members WHERE id = ?1`, [
    memberId,
  ])) as { id: string }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "last_admin" };
}

// 역할 지정/해제 결과
export type RoleResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "last_admin" };

// 역할 지정/해제 — admin ↔ user (검증은 라우트, v3.2)
// 마지막 관리자 보호를 UPDATE 가드로 원자 판정 — withdrawMember 와 같은 방식.
// 0행이면 재조회로 없음(not_found) vs 마지막 관리자(last_admin)를 가린다.
export async function setMemberRole(
  db: Sql,
  memberId: string,
  role: Role,
): Promise<RoleResult> {
  const rows = (await db.query(
    `UPDATE members SET role = ?1 WHERE id = ?2
       AND (?1 = 'admin'
            OR role <> 'admin'
            OR (SELECT COUNT(*) FROM members x
                 WHERE x.role = 'admin' AND x.deactivated_at IS NULL
                   AND x.id <> members.id) >= 1)
     RETURNING id`,
    [role, memberId],
  )) as { id: string }[];
  if (rows.length > 0) return { ok: true };
  const found = (await db.query(`SELECT id FROM members WHERE id = ?1`, [
    memberId,
  ])) as { id: string }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "last_admin" };
}
