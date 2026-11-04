// 회원(Member) 도메인 서비스 — 목록/탈퇴/역할 SQL 을 직접 소유
// 소프트 삭제(이력 보존), 마지막 관리자 보호
import type { Sql } from "../db";
import type { AdminMember } from "../../../shared/api-types";
import type { Role } from "../types";

// 목록 — 최근 가입순
export async function listMembers(db: Sql): Promise<AdminMember[]> {
  return (await db.query(
    `SELECT id, email, name, phone, affiliation, role, deactivated_at, created_at,
            (SELECT COUNT(*) FROM reservations r WHERE r.member_id = members.id AND r.status = 'rented') AS active_rental_count
       FROM members
       WHERE registration_deleted_at IS NULL
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
// deactivated_at을 기록한다. 탈퇴 회원이 다시 로그인하면 같은 행이 복구되지만 역할은 일반
// 회원으로 초기화된다(대여·관리 이력은 유지). 완전 초기화는 별도의 등록 정보 삭제로 처리한다.
// 마지막 관리자 보호는 역할 핸들러와 같은 기준.
// 마지막 관리자 보호는 COUNT-then-UPDATE 두 쿼리로 나누면 동시 해임 레이스로 관리자가 0이 될 수
// 있어, 가드를 UPDATE WHERE 절 안에 넣어 단일 문장으로 원자 판정한다 (대여 가드 INSERT와 같은 방식).
export async function withdrawMember(
  db: Sql,
  memberId: string,
): Promise<WithdrawResult> {
  // 이번 작업의 타임스탬프 — 회원 UPDATE 와 예약 취소가 같은 값을 쓴다.
  // 이미 탈퇴한 회원의 옛 타임스탬프와 구분해, 이번 UPDATE 가 실제로 성공했을 때만 취소한다.
  const now = new Date().toISOString();
  const results = await db.batch<{ id: string }>([
    {
      sql: `UPDATE members SET deactivated_at = ?2
             WHERE id = ?1 AND registration_deleted_at IS NULL
              AND (role <> 'admin'
                   OR (SELECT COUNT(*) FROM members x
                        WHERE x.role = 'admin' AND x.deactivated_at IS NULL
                          AND x.id <> members.id) >= 1)
            RETURNING id`,
      params: [memberId, now],
    },
    {
      // 미시작 건만 취소한다. rented 는 반납 전까지 그대로 둔다(탈퇴 정책).
      // EXISTS 가 이번 UPDATE 의 타임스탬프를 확인하므로 last_admin 실패 시 취소되지 않는다.
      sql: `UPDATE reservations
               SET status = 'cancelled', updated_at = ?2
             WHERE member_id = ?1 AND status IN ('pending', 'reserved')
               AND EXISTS (SELECT 1 FROM members
                            WHERE id = ?1 AND deactivated_at = ?2)`,
      params: [memberId, now],
    },
  ]);
  if (results[0].length > 0) return { ok: true };
  const found = (await db.query(`SELECT id FROM members WHERE id = ?1 AND registration_deleted_at IS NULL`, [
    memberId,
  ])) as { id: string }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "last_admin" };
}

export type DeleteRegistrationResult =
  | { ok: true }
  | { error: "not_found" | "active_member" | "has_active_rentals" };

// 탈퇴 회원의 개인정보를 익명화하고 이메일을 해제한다. 내부 ID·대여/관리 이력은 보존한다.
// 활성 대여 검사를 UPDATE 안에 두어 사전 검사와 변경 사이의 경쟁을 막는다.
export async function deleteMemberRegistration(db: Sql, memberId: string): Promise<DeleteRegistrationResult> {
  const now = new Date().toISOString();
  const anonymousEmail = `removed-${crypto.randomUUID()}@example.invalid`;
  const results = await db.batch<{ id: string }>([
    {
      sql: `UPDATE members SET email = ?2, name = '삭제된 회원', phone = NULL, affiliation = NULL, role = 'user',
              registration_deleted_at = ?3
            WHERE id = ?1 AND deactivated_at IS NOT NULL AND registration_deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.member_id = members.id AND r.status = 'rented')
            RETURNING id`,
      params: [memberId, anonymousEmail, now],
    },
    {
      // 익명화가 실제로 성공했을 때만(같은 타임스탬프) 미시작 건을 취소한다.
      sql: `UPDATE reservations
               SET status = 'cancelled', updated_at = ?2
             WHERE member_id = ?1 AND status IN ('pending', 'reserved')
               AND EXISTS (SELECT 1 FROM members
                            WHERE id = ?1 AND registration_deleted_at = ?2)`,
      params: [memberId, now],
    },
  ]);
  if (results[0].length) return { ok: true };
  const [member] = await db.query<{ deactivated_at: string | null }>(
    `SELECT deactivated_at FROM members WHERE id = ?1 AND registration_deleted_at IS NULL`, [memberId],
  );
  if (!member) return { error: "not_found" };
  return { error: member.deactivated_at === null ? "active_member" : "has_active_rentals" };
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
    `UPDATE members SET role = ?1 WHERE id = ?2 AND registration_deleted_at IS NULL
       AND (?1 = 'admin'
            OR role <> 'admin'
            OR (SELECT COUNT(*) FROM members x
                 WHERE x.role = 'admin' AND x.deactivated_at IS NULL
                   AND x.id <> members.id) >= 1)
     RETURNING id`,
    [role, memberId],
  )) as { id: string }[];
  if (rows.length > 0) return { ok: true };
  const found = (await db.query(`SELECT id FROM members WHERE id = ?1 AND registration_deleted_at IS NULL`, [
    memberId,
  ])) as { id: string }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "last_admin" };
}
