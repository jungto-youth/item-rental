// 예약(Reservation) 도메인 서비스 — 신청/취소/내역/관리자 전이의 SQL 을 직접 소유
// SPEC §3·§4.3·§8 — 가용성 검사 + advisory 락 동시성, 조건부 상태 전이
import type { Sql } from "../db";
import { KST_TODAY } from "../dates";

// 예약 가능 아이템 조회 (사전 검사용)
export type ReserveItem = {
  id: number;
  status: string;
  kind: string;
  max_days: number;
  total_qty: number;
  qty_broken: number;
};

// 예약 생성 파라미터
export type CreateReservationParams = {
  itemId: number;
  memberId: string;
  startDate: string;
  endDate: string;
  memo: string | null;
  qty: number;
  days: number;
};

// 결과 타입 — 호출자가 switch/discriminated union으로 처리
export type ReservationResult =
  | { ok: true; id: number }
  | { error: "not_found" }
  | { error: "item_not_active" }
  | { error: "consumable" }
  | { error: "too_long"; maxDays: number }
  | { error: "too_many"; rentable: number }
  | { error: "no_availability" }
  | { error: "busy" };

// 신청 사이 물품 삭제(FK 23503)와 락 대기 초과(55P03)를 결과 배열과 구분하는 sentinel
const TIMEOUT: unique symbol = Symbol("lock_timeout");

// 1단계 사전 검사 — 오류 코드 구분용 (가용성은 아래 단일 문장이 보장)
export async function getItemForReservation(
  db: Sql,
  itemId: number,
): Promise<ReserveItem | null> {
  const [row] = (await db.query(
    `SELECT id, status, kind, max_days, total_qty, qty_broken FROM items WHERE id = $1`,
    [itemId],
  )) as ReserveItem[];
  return row ?? null;
}

// 사전 검증 — 1단계 빠른 에러 응답용. 가용성은 실제 INSERT에서 보장
export function validateReservation(
  item: ReserveItem,
  params: {
    qty: number;
    days: number;
  },
):
  | { ok: true }
  | { error: "item_not_active" }
  | { error: "consumable" }
  | { error: "too_long"; maxDays: number }
  | { error: "too_many"; rentable: number } {
  if (item.status !== "active") return { error: "item_not_active" };
  // 소모품은 대여 대상이 아니다 (§4.2)
  if (item.kind === "consumable") return { error: "consumable" };
  if (params.days > item.max_days)
    return { error: "too_long", maxDays: item.max_days };
  const rentable = item.total_qty - item.qty_broken;
  if (params.qty > rentable) return { error: "too_many", rentable };
  return { ok: true };
}

// 2단계 — 실제 예약 생성 (advisory 락 + 가용 검사 + INSERT, §8)
export async function createReservation(
  db: Sql,
  params: CreateReservationParams,
): Promise<ReservationResult> {
  const { itemId, memberId, startDate, endDate, memo, qty, days } = params;

  // 사전 검사 — 빠른 오류 응답용. 가용성은 실제 INSERT에서 보장
  const item = await getItemForReservation(db, itemId);
  if (!item) return { error: "not_found" };

  const validation = validateReservation(item, { qty, days });
  if ("error" in validation) return validation;

  // 동시 신청 직렬화 — 물품별 advisory 락을 먼저 잡고 같은 트랜잭션에서 가드 INSERT를 실행
  const results = await db
    .transaction([
      // 락 대기가 무한정 길어지지 않게 트랜잭션 범위 초 단위로 제한
      db`SET LOCAL lock_timeout = '5s'`,
      db`SELECT pg_advisory_xact_lock(${itemId}::bigint)`,
      // 일별 최대 동시 점유 검사 — 요청 기간의 매 대여일마다 잔여 수량이 있어야 INSERT
      db`INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo, qty)
         SELECT ${itemId}, ${memberId}, ${startDate}, ${endDate}, ${memo}, ${qty}
         WHERE ${qty} <= (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
           AND EXISTS (SELECT 1 FROM items
                        WHERE items.id = ${itemId} AND status = 'active' AND kind <> 'consumable'
                          AND ${days} <= max_days)
           AND NOT EXISTS (
           SELECT 1
           FROM generate_series(${startDate}::date, ${endDate}::date - 1, interval '1 day') AS d(day)
           JOIN reservations r
             ON r.item_id = ${itemId}
            AND r.status IN ('pending', 'approved', 'picked_up')
            AND r.start_date <= d.day::date
            AND r.end_date > d.day::date
           GROUP BY d.day
           HAVING COALESCE(SUM(r.qty), 0) + ${qty}
                  > (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
         )
         RETURNING id`,
    ])
    .catch((err: { code?: string }) => {
      // 신청 사이 물품 삭제 — FK 위반은 '수량 없음'이 아니므로 404로 구분
      if (err.code === "23503") return null;
      // 락 대기 초과 — 5초 상한을 넘으면 큐 끝이 아니라 즉시 응답 (lock_timeout · 55P03)
      if (err.code === "55P03") return TIMEOUT;
      throw err;
    });

  if (results === null) return { error: "not_found" };
  if (results === TIMEOUT) return { error: "busy" };

  const inserted = results[1] as { id: number }[];
  if (inserted.length > 0) return { ok: true, id: inserted[0].id };

  // 0행 — 가드가 거절했다(재고·상태·기간 변경 또는 물품 삭제). 재조회로 원인을 가려
  const [cur] = (await db.query(
    `SELECT status, kind, max_days, total_qty, qty_broken FROM items WHERE id = $1`,
    [itemId],
  )) as ReserveItem[];

  if (!cur) return { error: "not_found" };
  if (cur.status !== "active") return { error: "item_not_active" };
  if (cur.kind === "consumable") return { error: "consumable" };
  if (days > cur.max_days) return { error: "too_long", maxDays: cur.max_days };
  return { error: "no_availability" };
}

// ===== 내 예약 조회 (§4.1) =====
export async function getMyReservations(db: Sql, memberId: string) {
  return db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || p.r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.start_date::text AS start_date, r.end_date::text AS end_date,
            r.qty, r.status, r.status_note, r.member_memo,
            (r.status = 'picked_up' AND r.end_date < ${KST_TODAY}) AS is_overdue,
            r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = $1
      ORDER BY r.created_at DESC`,
    [memberId],
  );
}

// ===== 예약 취소 (§3) =====
// 결과 — bad_status: 본인 건이지만 수령 후(picked_up 이후)라 취소 불가
export type CancelResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "bad_status" };

export async function cancelReservation(
  db: Sql,
  reservationId: number,
  memberId: string,
): Promise<CancelResult> {
  const rows = (await db.query(
    `UPDATE reservations SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND member_id = $2 AND status IN ('pending', 'approved')
      RETURNING id`,
    [reservationId, memberId],
  )) as { id: number }[];
  if (rows.length > 0) return { ok: true };
  // 없음/타인 건 → not_found, 종료 상태 → bad_status 구분
  const found = (await db.query(
    `SELECT member_id FROM reservations WHERE id = $1`,
    [reservationId],
  )) as { member_id: string }[];
  if (found.length === 0 || found[0].member_id !== memberId) {
    return { error: "not_found" };
  }
  return { error: "bad_status" };
}

// ===== 관리자: 목록·상태 전이 (§4.3) =====

export const RESERVATION_STATUSES = [
  "pending",
  "approved",
  "picked_up",
  "returned",
  "rejected",
  "cancelled",
];

// 조건부 전이 결과 — bad_status: 잘못된 전이 (기대 상태가 아님)
export type TransitionResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "bad_status" };

// 조건부 전이 공용 처리 — 기대 상태가 아니면 빈 결과 → 없음(404) vs 잘못된 전이(409) 구분
async function transition(
  db: Sql,
  reservationId: number,
  sql: string,
  params: unknown[],
): Promise<TransitionResult> {
  const rows = (await db.query(sql, params)) as { id: number }[];
  if (rows.length > 0) return { ok: true };
  const found = (await db.query(`SELECT id FROM reservations WHERE id = $1`, [
    reservationId,
  ])) as {
    id: number;
  }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "bad_status" };
}

// 관리자 목록 — pending이 맨 위, 최근 신청순. pending 행의 초과 경고용 conflict_count 포함 (§3)
export async function listReservations(db: Sql, status: string | null) {
  const rows = await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name, items.total_qty,
            r.member_id, m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
            r.start_date::text AS start_date, r.end_date::text AS end_date,
            r.status, r.status_note, r.member_memo,
            (r.status = 'picked_up' AND r.end_date < ${KST_TODAY}) AS is_overdue,
            -- 초과일 수 — 이 건을 승인하면 정원을 넘는 날. 신청 가드(v2.11)가 pending까지 일별
            -- 점유로 세므로 정상 흐름에선 항상 0이고, 0이 아니면 이상 상태(동시성 레이스나
            -- 운영진의 total_qty 인하)다. '확정 건과 겹치는 건수'가 아니다 — 수량 ≥ 2에선
            -- 같은 날 공존이 정상이라 그 기준은 매번 뜨는 무해한 소음이 된다 (§3)
            -- 점유량은 건수가 아니라 SUM(qty)이고, 정원도 수리중을 뺀 rentable로 봐야 한다 —
            -- COUNT(*)로 세면 qty=30 예약 하나가 30개를 점유해도 '1건'으로 보여 오탐/미탐이 난다.
            (SELECT COUNT(*)::int
               FROM generate_series(r.start_date, r.end_date - 1, interval '1 day') AS d(day)
              WHERE (SELECT COALESCE(SUM(r2.qty), 0) FROM reservations r2
                      WHERE r2.item_id = r.item_id AND r2.id <> r.id
                        AND r2.status IN ('approved','picked_up')
                        AND r2.start_date <= d.day::date AND r2.end_date > d.day::date
                    ) + r.qty > items.total_qty - items.qty_broken) AS conflict_count,
            a.name AS admin_name, r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN members a ON a.id = r.admin_id
      WHERE ($1::text IS NULL OR r.status = $1::text)
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 500`,
    [status],
  );
  // 500건 하드 리밋 — 넘으면 오래된 건이 잘린다. 화면에서 '500건 이상' 표시를 위해 절단 여부를 내려준다
  const truncated = (rows as { id: number }[]).length === 500;
  return { reservations: rows, truncated };
}

// 수량 조정 승인 — pending → approved. qty 는 감소만 허용 (§4.3)
// qty_increase_not_allowed: 증가 요청 — 거절 후 재신청이 정확하다 (§3)
export type ApproveResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "bad_status" }
  | { error: "qty_increase_not_allowed" };

export async function approveReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
  qty: number | null,
): Promise<ApproveResult> {
  if (qty !== null) {
    // 현재 신청 수량 — 초과(증가)는 명시적으로 거부해 bad_status와 구분한다
    const cur = (await db.query(
      `SELECT qty FROM reservations WHERE id = $1 AND status = 'pending'`,
      [reservationId],
    )) as { qty: number }[];
    if (cur.length > 0 && qty > cur[0].qty)
      return { error: "qty_increase_not_allowed" };
  }
  // SQL 쪽 조건은 레이스 대비 — 위 SELECT와 UPDATE 사이에 회원이 취소하거나
  // 관리자가 먼저 처리했을 수 있다
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'approved', admin_id = $2, qty = COALESCE($3::int, qty),
            updated_at = now()
      WHERE id = $1 AND status = 'pending'
        AND ($3::int IS NULL OR $3::int <= qty)
      RETURNING id`,
    [reservationId, adminId, qty],
  );
}

// 거절 — pending → rejected, 사유 필수 (검증은 라우트)
export async function rejectReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
  reason: string,
): Promise<TransitionResult> {
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'rejected', status_note = $2, admin_id = $3, updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [reservationId, reason, adminId],
  );
}

// 수령 — approved → picked_up
export async function pickupReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
): Promise<TransitionResult> {
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'picked_up', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'approved' RETURNING id`,
    [reservationId, adminId],
  );
}

// 반납 — picked_up → returned
export async function returnReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
): Promise<TransitionResult> {
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'returned', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'picked_up' RETURNING id`,
    [reservationId, adminId],
  );
}
