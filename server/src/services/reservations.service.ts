// 대여(Rental) 도메인 서비스 — 신청/취소/내역/관리자 전이의 SQL 을 직접 소유
// 가용성 검사 + advisory 락 동시성, 조건부 상태 전이
//
// 날짜·기간·최대 대여일이 없는 단순 모델이다. 회원이 수량+메모로 신청하면 즉시
// '대여 중'(rented)이 되고, 관리자는 반납(returned)만 처리한다. 가용성은
// "지금 대여 중인 수량의 합"만 센다 — 일별 점유도, 승인 대기 예약도 없다.
import type { Sql } from "../db";

// 대여 가능 아이템 조회 (사전 검사용)
export type ReserveItem = {
  id: number;
  status: string;
  kind: string;
  total_qty: number;
  qty_broken: number;
};

// 대여 생성 파라미터 — 날짜가 없으므로 수량과 메모만 받는다
export type CreateReservationParams = {
  itemId: number;
  memberId: string;
  memo: string | null;
  qty: number;
};

// 결과 타입 — 호출자가 switch/discriminated union으로 처리
export type ReservationResult =
  | { ok: true; id: number }
  | { error: "not_found" }
  | { error: "item_not_active" }
  | { error: "consumable" }
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
    `SELECT id, status, kind, total_qty, qty_broken FROM items WHERE id = $1`,
    [itemId],
  )) as ReserveItem[];
  return row ?? null;
}

// 사전 검증 — 1단계 빠른 에러 응답용. 가용성은 실제 INSERT에서 보장
export function validateReservation(
  item: ReserveItem,
  params: { qty: number },
):
  | { ok: true }
  | { error: "item_not_active" }
  | { error: "consumable" }
  | { error: "too_many"; rentable: number } {
  if (item.status !== "active") return { error: "item_not_active" };
  // 소모품은 대여 대상이 아니다 ()
  if (item.kind === "consumable") return { error: "consumable" };
  const rentable = item.total_qty - item.qty_broken;
  if (params.qty > rentable) return { error: "too_many", rentable };
  return { ok: true };
}

// 2단계 — 실제 대여 생성 (advisory 락 + 가용 검사 + INSERT)
export async function createReservation(
  db: Sql,
  params: CreateReservationParams,
): Promise<ReservationResult> {
  const { itemId, memberId, memo, qty } = params;

  // 사전 검사 — 빠른 오류 응답용. 가용성은 실제 INSERT에서 보장
  const item = await getItemForReservation(db, itemId);
  if (!item) return { error: "not_found" };

  const validation = validateReservation(item, { qty });
  if ("error" in validation) return validation;

  // 동시 신청 직렬화 — 물품별 advisory 락을 먼저 잡고 같은 트랜잭션에서 가드 INSERT를 실행.
  // 날짜가 없어져도 이 락은 그대로 필요하다: 두 요청이 같은 순간에 남은 수량 1개를 각자 읽고
  // 둘 다 INSERT하면 재고를 넘긴다. READ COMMITTED에서 단일 문장의 원자성만으로는
  // 두 동시 신청의 직렬화가 보장되지 않는다.
  const results = await db
    .transaction([
      // 락 대기가 무한정 길어지지 않게 트랜잭션 범위 초 단위로 제한
      db`SET LOCAL lock_timeout = '5s'`,
      db`SELECT pg_advisory_xact_lock(${itemId}::bigint)`,
      // 현재 대여 중(rented) 수량의 합 + 신청 수량이 대여가능 수량을 넘지 않아야 INSERT.
      // 반납(returned)·취소(cancelled)는 점유에서 빠진다 — 그 수량은 다시 빌려줄 수 있다.
      db`INSERT INTO reservations (item_id, member_id, member_memo, qty, status)
         SELECT ${itemId}, ${memberId}, ${memo}, ${qty}, 'rented'
         WHERE ${qty} <= (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
           AND EXISTS (SELECT 1 FROM items
                        WHERE items.id = ${itemId} AND status = 'active' AND kind <> 'consumable')
           AND ${qty} + COALESCE((SELECT SUM(r.qty) FROM reservations r
                                   WHERE r.item_id = ${itemId} AND r.status = 'rented'), 0)
               <= (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
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

  // transaction() 결과는 쿼리 순서와 1:1: [SET LOCAL, advisory lock, INSERT]
  // 락 SELECT는 항상 1행을 반환하므로 results[1]을 보면 재고가 없어도 성공으로 오인한다.
  const inserted = results.at(-1) as { id: number }[];

  if (inserted.length > 0) return { ok: true, id: inserted[0].id };

  // 0행 — 가드가 거절했다(재고·상태 변경 또는 물품 삭제). 재조회로 원인을 가려
  const [cur] = (await db.query(
    `SELECT status, kind, total_qty, qty_broken FROM items WHERE id = $1`,
    [itemId],
  )) as ReserveItem[];

  if (!cur) return { error: "not_found" };
  if (cur.status !== "active") return { error: "item_not_active" };
  if (cur.kind === "consumable") return { error: "consumable" };
  return { error: "no_availability" };
}

// ===== 내 대여 조회 () =====
export async function getMyReservations(db: Sql, memberId: string) {
  return db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || p.r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.qty, r.status, r.member_memo, r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = $1
      ORDER BY r.created_at DESC`,
    [memberId],
  );
}

// ===== 본인 조작: 취소·반납 () =====
// 결과 — bad_status: 본인 건이지만 이미 반납·취소되어 더 손댈 수 없음
export type OwnActionResult =
  { ok: true } | { error: "not_found" } | { error: "bad_status" };

// 본인 조작 공용 처리 — "본인 + 대여 중(rented)" 조건이 아니면 빈 결과가 돌아온다.
// 빈 결과의 원인을 재조회로 가려 404(없음·타인 건)와 409(이미 종료)를 구분한다.
// WHERE 절에 member_id 를 반드시 넣는다 — 남의 대여를 조작할 수 없어야 한다 ()
async function ownAction(
  db: Sql,
  reservationId: number,
  memberId: string,
  sql: string,
): Promise<OwnActionResult> {
  const rows = (await db.query(sql, [reservationId, memberId])) as {
    id: number;
  }[];
  if (rows.length > 0) return { ok: true };
  const found = (await db.query(
    `SELECT member_id FROM reservations WHERE id = $1`,
    [reservationId],
  )) as { member_id: string }[];
  if (found.length === 0 || found[0].member_id !== memberId) {
    return { error: "not_found" };
  }
  return { error: "bad_status" };
}

export async function cancelReservation(
  db: Sql,
  reservationId: number,
  memberId: string,
): Promise<OwnActionResult> {
  // 대여 중(rented)인 본인 건만 취소할 수 있다 — 반납 완료 건은 이력이므로 되돌리지 않는다
  return ownAction(
    db,
    reservationId,
    memberId,
    `UPDATE reservations SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND member_id = $2 AND status = 'rented'
      RETURNING id`,
  );
}

// 반납 — 회원이 직접 처리한다. 관리자 경로(returnReservation)와 달리 admin_id 를 건드리지 않는다.
// admin_id 는 '처리한 관리자'를 뜻하므로 회원이 반납한 건은 NULL 로 남고, 그 자체가
// "회원이 직접 반납했다"는 사실을 담는다 — 관리자 목록이 이 값으로 구분해 보여준다.
// 회원의 반납은 자기 신고이므로 관리자는 목록에서 그 건을 따로 확인할 수 있어야 한다.
export async function returnReservationByMember(
  db: Sql,
  reservationId: number,
  memberId: string,
): Promise<OwnActionResult> {
  return ownAction(
    db,
    reservationId,
    memberId,
    `UPDATE reservations SET status = 'returned', updated_at = now()
      WHERE id = $1 AND member_id = $2 AND status = 'rented'
      RETURNING id`,
  );
}

// ===== 관리자: 목록·상태 전이 () =====

export const RESERVATION_STATUSES = ["rented", "returned", "cancelled"];

// 조건부 전이 결과 — bad_status: 잘못된 전이 (기대 상태가 아님)
export type TransitionResult =
  { ok: true } | { error: "not_found" } | { error: "bad_status" };

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

// 관리자 목록 — 대여 중이 맨 위, 최근 신청순.
// 날짜가 없어져 초과 경고(conflict_count)도 없다: 신청 가드가 대여 중 수량을 직접 세므로
// 정원 초과 상태 자체가 만들어지지 않는다.
export async function listReservations(db: Sql, status: string | null) {
  const rows = await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name, items.total_qty,
            r.member_id, m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
            r.status, r.member_memo,
            a.name AS admin_name, r.created_at,
            -- 누가 반납 처리했는가 — 반납은 관리자와 회원이 모두 할 수 있다.
            -- admin_id 는 '처리한 관리자'라, 비어 있는 returned 행은 회원이 직접 반납한 것이다.
            -- 회원 반납은 자기 신고이므로 관리자가 목록에서 구분해 확인할 수 있어야 한다.
            (r.status = 'returned' AND r.admin_id IS NULL) AS returned_by_member
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN members a ON a.id = r.admin_id
      WHERE ($1::text IS NULL OR r.status = $1::text)
      ORDER BY (r.status = 'rented') DESC, r.created_at DESC
      LIMIT 500`,
    [status],
  );
  // 500건 하드 리밋 — 넘으면 오래된 건이 잘린다. 화면에서 '500건 이상' 표시를 위해 절단 여부를 내려준다
  const truncated = (rows as { id: number }[]).length === 500;
  return { reservations: rows, truncated };
}

// 반납 — rented → returned. 관리자가 물품을 돌려받았을 때 누른다
export async function returnReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
): Promise<TransitionResult> {
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'returned', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'rented' RETURNING id`,
    [reservationId, adminId],
  );
}
