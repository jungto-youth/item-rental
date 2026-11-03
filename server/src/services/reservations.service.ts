// 대여(Rental) 도메인 서비스 — 신청/취소/내역/관리자 전이의 SQL 을 직접 소유
// 가용성 검사 + batch 원자 가드, 조건부 상태 전이
//
// 회원이 수량·메모·반납 예정일로 신청하면 '신청 대기'(pending)가 되고, 관리자가
// 승인해야 '대여 중'(rented)이 된다. 신청 시에는 재고를 점유하지 않는다 — 승인할
// 때 원자적으로 재고를 확인한다. 가용성 계산은 지금 대여 중(rented)인 수량만 센다.
// 연체는 저장하지 않고 due_at < now 로 파생한다.
import { SQL_NOW, type Sql } from "../db";
import type {
  AdminReservation,
  MyReservation,
} from "../../../shared/api-types";
import { defaultDueAtIso } from "../../../shared/rental-period";

// 대여 가능 아이템 조회 (사전 검사용)
export type ReserveItem = {
  id: number;
  lifecycle: string;
  kind: string;
  total_qty: number;
  qty_repair: number;
};

// 대여 생성 파라미터 — 수량·메모·반납 예정일. dueAt 은 KST 날짜의 끝(UTC ISO)이다.
// 생략하면 기본 7일 뒤로 채운다(HTTP 경계는 항상 명시값을 넘긴다).
export type CreateReservationParams = {
  itemId: number;
  memberId: string;
  memo: string | null;
  qty: number;
  dueAt?: string | null;
};

// 결과 타입 — 호출자가 switch/discriminated union으로 처리
type ReservationResult =
  | { ok: true; id: number }
  | { error: "not_found" }
  | { error: "item_not_active" }
  | { error: "consumable" }
  | { error: "too_many"; rentable: number }
  | { error: "no_availability" };

// 1단계 사전 검사 — 오류 코드 구분용 (가용성은 아래 단일 문장이 보장)
async function getItemForReservation(
  db: Sql,
  itemId: number,
): Promise<ReserveItem | null> {
  const [row] = (await db.query(
    `SELECT id, lifecycle, kind, total_qty, qty_repair FROM items WHERE id = ?1`,
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
  // 폐기(lifecycle='retired')면 대여 불가. '수리중'은 아래 수량(rentable)에서 걸러진다
  if (item.lifecycle !== "active") return { error: "item_not_active" };
  // 소모품은 대여 대상이 아니다 ()
  if (item.kind === "consumable") return { error: "consumable" };
  const rentable = item.total_qty - item.qty_repair;
  if (params.qty > rentable) return { error: "too_many", rentable };
  return { ok: true };
}

// 2단계 — 실제 대여 생성 (가드 INSERT: 가용·상태 검사와 INSERT 를 원자 수행)
export async function createReservation(
  db: Sql,
  params: CreateReservationParams,
): Promise<ReservationResult> {
  const { itemId, memberId, memo, qty } = params;
  const dueAt = params.dueAt ?? defaultDueAtIso();

  // 사전 검사 — 빠른 오류 응답용. 가용성은 실제 INSERT에서 보장
  const item = await getItemForReservation(db, itemId);
  if (!item) return { error: "not_found" };

  const validation = validateReservation(item, { qty });
  if ("error" in validation) return validation;

  // 동시 신청 — SQLite 단일 라이터 + D1 batch 원자성이 Postgres advisory 락을 대체한다.
  // D1 의 batch 는 하나의 트랜잭션으로 직렬 실행되므로 두 동시 신청이 남은 수량 1개를
  // 각자 읽고 둘 다 INSERT 하는 끼어들기가 없다. 잔여 수량 판정은 가드 INSERT 문 하나가
  // 원자적으로 수행한다 — batch 결과에서 INSERT 의 RETURNING 행수로만 성공을 판정한다.
  let results: { id: number }[][];
  try {
    results = await db.batch<{ id: number }>([
      // 현재 대여 중(rented) 수량의 합 + 신청 수량이 대여가능 수량을 넘지 않아야 INSERT.
      // 반납(returned)·취소(cancelled)는 점유에서 빠진다 — 그 수량은 다시 빌려줄 수 있다.
      {
        // 스냅샷 2개 — 이력은 '그 시점의 물품명·위치'를 남겨야 한다. 물품이 개명되거나 보관
        // 위치가 바뀌어도 과거 행의 표기는 그대로여야 한다(0004_rental_history.sql).
        // 위치는 0005 부터 locations 참조라 이름을 join 으로 풀어 스냅샷에 넣는다.
        // 쓰기 경로가 이 INSERT 하나뿐이라 트리거 없이 여기서 세팅한다.
        sql: `INSERT INTO reservations (item_id, member_id, member_memo, qty, due_at, status,
                                        item_name_snapshot, item_location_snapshot,
                                        member_affiliation_snapshot)
           SELECT ?1, ?2, ?3, ?4, ?5, 'pending',
                  (SELECT name FROM items WHERE items.id = ?1),
                  (SELECT l.name FROM locations l
                     JOIN items i ON i.location_id = l.id WHERE i.id = ?1),
                  (SELECT affiliation FROM members WHERE members.id = ?2)
           WHERE ?4 <= (SELECT total_qty - qty_repair FROM items WHERE items.id = ?1)
             AND EXISTS (SELECT 1 FROM items
                          WHERE items.id = ?1 AND lifecycle = 'active' AND kind <> 'consumable')
             AND ?4 + COALESCE((SELECT SUM(r.qty) FROM reservations r
                                 WHERE r.item_id = ?1 AND r.status = 'rented'), 0)
                 <= (SELECT total_qty - qty_repair FROM items WHERE items.id = ?1)
           RETURNING id`,
        params: [itemId, memberId, memo, qty, dueAt],
      },
    ]);
  } catch (err) {
    // 신청 사이 물품 삭제 — FK 위반은 '수량 없음'이 아니므로 404로 구분
    if (err instanceof Error && /FOREIGN KEY constraint failed/.test(err.message)) {
      return { error: "not_found" };
    }
    throw err;
  }

  // INSERT 의 RETURNING 이 0행이면 성공으로 오인하지 않는다 — 가드가 거절한 것.
  const inserted = results.at(-1)!;

  if (inserted.length > 0) return { ok: true, id: inserted[0].id };

  // 0행 — 가드가 거절했다(재고·상태 변경 또는 물품 삭제). 재조회로 원인을 가려
  const [cur] = (await db.query(
    `SELECT lifecycle, kind, total_qty, qty_repair FROM items WHERE id = ?1`,
    [itemId],
  )) as ReserveItem[];

  if (!cur) return { error: "not_found" };
  if (cur.lifecycle !== "active") return { error: "item_not_active" };
  if (cur.kind === "consumable") return { error: "consumable" };
  return { error: "no_availability" };
}

// ===== 내 대여 조회 () =====
export async function getMyReservations(
  db: Sql,
  memberId: string,
): Promise<MyReservation[]> {
  const rows = (await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || p.r2_key || '?access=members' FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.qty, r.status, r.member_memo, r.created_at, r.updated_at,
            r.due_at,
            (r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}) AS is_overdue,
            r.decided_at, r.rejected_reason
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = ?1
      ORDER BY r.created_at DESC`,
    [memberId],
  )) as (Omit<MyReservation, "is_overdue"> & { is_overdue: number })[];
  // SQLite 는 boolean 식을 0/1 로 돌려준다 — API 계약(boolean)을 유지한다
  return rows.map((row) => ({ ...row, is_overdue: row.is_overdue !== 0 }));
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
    `SELECT member_id FROM reservations WHERE id = ?1`,
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
  // 신청 대기(pending)와 대여 중(rented)인 본인 건만 취소할 수 있다.
  // 반납·거절 완료 건은 이력이므로 되돌리지 않는다.
  return ownAction(
    db,
    reservationId,
    memberId,
    `UPDATE reservations SET status = 'cancelled', updated_at = ${SQL_NOW}
      WHERE id = ?1 AND member_id = ?2 AND status IN ('pending', 'rented')
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
    `UPDATE reservations SET status = 'returned', returned_at = ${SQL_NOW}, updated_at = ${SQL_NOW}
      WHERE id = ?1 AND member_id = ?2 AND status = 'rented'
      RETURNING id`,
  );
}

// ===== 관리자: 목록·상태 전이 () =====

export const RESERVATION_STATUSES = [
  "pending",
  "rented",
  "returned",
  "cancelled",
  "rejected",
];

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
  const found = (await db.query(`SELECT id FROM reservations WHERE id = ?1`, [
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
export async function listReservations(
  db: Sql,
  status: string | null,
): Promise<{ reservations: AdminReservation[]; truncated: boolean }> {
  // status='overdue' 는 저장된 상태가 아니라 파생 필터다 — 반납 예정일이 지난 대여 중 건만.
  const overdueOnly = status === "overdue";
  const where = overdueOnly
    ? `r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}`
    : `(?1 IS NULL OR r.status = ?1)`;
  const params = overdueOnly ? [] : [status];
  const rows = await db.query(
    `SELECT r.id, r.item_id,
            -- 이력 표기는 스냅샷을 우선한다 — 물품이 개명돼도 이 표는 그 시점의 이름이다.
            -- 스냅샷이 비어 있으면(마이그레이션 이전 행 등) 현재 이름으로 물러난다.
            COALESCE(r.item_name_snapshot, items.name) AS item_name,
            r.item_name_snapshot, r.item_location_snapshot, r.returned_at,
            r.due_at,
            (r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}) AS is_overdue,
            items.total_qty,
            r.qty,
            r.member_id, m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
            m.affiliation AS member_affiliation,
            r.member_affiliation_snapshot,
            r.status, r.member_memo,
            r.decided_at, r.rejected_reason,
            d.name AS decided_by_name,
            a.name AS admin_name, r.created_at, r.updated_at,
            -- 누가 반납 처리했는가 — 반납은 관리자와 회원이 모두 할 수 있다.
            -- admin_id 는 '처리한 관리자'라, 비어 있는 returned 행은 회원이 직접 반납한 것이다.
            -- 회원 반납은 자기 신고이므로 관리자가 목록에서 구분해 확인할 수 있어야 한다.
            (r.status = 'returned' AND r.admin_id IS NULL) AS returned_by_member
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN members a ON a.id = r.admin_id
       LEFT JOIN members d ON d.id = r.decided_by
      WHERE ${where}
      ORDER BY
        (r.status = 'pending') DESC,
        (r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}) DESC,
        (r.status = 'rented') DESC,
        r.created_at DESC
      LIMIT 500`,
    params,
  );
  // 500건 하드 리밋 — 넘으면 오래된 건이 잘린다. 화면에서 '500건 이상' 표시를 위해 절단 여부를 내려준다
  const truncated = (rows as { id: number }[]).length === 500;
  // SQLite 는 boolean 식을 0/1 로 돌려준다 — API 계약(boolean)을 유지한다
  const reservations = (rows as (Record<string, unknown> & {
    returned_by_member: number;
    is_overdue: number;
  })[]).map((r) => ({
    ...r,
    returned_by_member: r.returned_by_member !== 0,
    is_overdue: r.is_overdue !== 0,
  })) as AdminReservation[];
  return { reservations, truncated };
}

// ===== 관리자: 승인·거절 (B-10) =====

export type ApprovalResult =
  | { ok: true }
  | {
      error:
        | "not_found"
        | "bad_status"
        | "item_not_active"
        | "consumable"
        | "due_date_passed"
        | "no_availability";
    };

export type RejectResult =
  | { ok: true }
  | { error: "not_found" | "bad_status" | "reason_required" };

// 승인 — pending → rented. 신청 시에는 재고를 잡지 않았으므로 여기서 다시 검사한다.
// 단일 조건부 UPDATE 안에 상태·물품 생애주기·가용 수량 가드를 모두 넣어, 두 관리자가
// 동시에 승인해도 마지막 하나만 성공하게 한다(대여 가드 INSERT와 같은 원자 판정).
export async function approveReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
): Promise<ApprovalResult> {
  const rows = (await db.query(
    `UPDATE reservations
        SET status = 'rented', decided_by = ?2,
            decided_at = ${SQL_NOW}, updated_at = ${SQL_NOW}
      WHERE id = ?1 AND status = 'pending'
        AND (due_at IS NULL OR due_at >= ${SQL_NOW})
        AND EXISTS (SELECT 1 FROM items
                     WHERE items.id = reservations.item_id
                       AND lifecycle = 'active' AND kind <> 'consumable')
        AND qty + COALESCE((SELECT SUM(r.qty) FROM reservations r
                             WHERE r.item_id = reservations.item_id
                               AND r.status = 'rented'), 0)
            <= (SELECT total_qty - qty_repair FROM items
                 WHERE items.id = reservations.item_id)
      RETURNING id`,
    [reservationId, adminId],
  )) as { id: number }[];
  if (rows.length > 0) return { ok: true };

  // 0행 — 없음 / 이미 처리됨 / 물품 상태 / 기한 경과 / 재고 없음 중 무엇인지 가른다.
  const [res] = (await db.query(
    `SELECT status, item_id, due_at FROM reservations WHERE id = ?1`,
    [reservationId],
  )) as { status: string; item_id: number; due_at: string | null }[];
  if (!res) return { error: "not_found" };
  if (res.status !== "pending") return { error: "bad_status" };
  if (res.due_at && res.due_at < new Date().toISOString()) {
    return { error: "due_date_passed" };
  }

  const [item] = (await db.query(
    `SELECT lifecycle, kind FROM items WHERE id = ?1`,
    [res.item_id],
  )) as { lifecycle: string; kind: string }[];
  if (!item) return { error: "not_found" };
  if (item.lifecycle !== "active") return { error: "item_not_active" };
  if (item.kind === "consumable") return { error: "consumable" };
  return { error: "no_availability" };
}

// 거절 — pending → rejected. 사유는 필수이며 이력에 남긴다.
export async function rejectReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
  reason: string,
): Promise<RejectResult> {
  const trimmed = reason.trim().slice(0, 500);
  if (!trimmed) return { error: "reason_required" };

  const rows = (await db.query(
    `UPDATE reservations
        SET status = 'rejected', decided_by = ?2,
            decided_at = ${SQL_NOW}, rejected_reason = ?3,
            updated_at = ${SQL_NOW}
      WHERE id = ?1 AND status = 'pending'
      RETURNING id`,
    [reservationId, adminId, trimmed],
  )) as { id: number }[];
  if (rows.length > 0) return { ok: true };

  const found = (await db.query(`SELECT id FROM reservations WHERE id = ?1`, [
    reservationId,
  ])) as { id: number }[];
  if (found.length === 0) return { error: "not_found" };
  return { error: "bad_status" };
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
    `UPDATE reservations SET status = 'returned', returned_at = ${SQL_NOW}, admin_id = ?2, updated_at = ${SQL_NOW}
      WHERE id = ?1 AND status = 'rented' RETURNING id`,
    [reservationId, adminId],
  );
}
