// 대여(Rental) 도메인 서비스 — 신청/취소/내역/관리자 전이의 SQL 을 직접 소유
// 가용성 검사 + 단일 INSERT 원자 가드, 조건부 상태 전이
//
// 재고는 세 영역이다 (0012).
//   rented   : 실제 대여 중        — 점유
//   pending  : 승인 대기, 배정 완료 — 점유
//   reserved : 반납을 기다리는 예약 — 미점유
//
// 회원이 신청하면 재고가 있는 부분은 pending, 부족한 부분은 reserved 로 나뉘고
// 같은 group_id 로 묶인다. 관리자가 승인해야 rented 가 된다. 가용성 계산은
// rented + pending <= R, 신규 reserved <= R 을 지킨다. 세 수량의 합은 R 로 제한하지
// 않는다 — 예약은 미래 반납분에 대한 순번이기 때문이다.
// 연체는 저장하지 않고 due_at < now 로 파생한다.
import { SQL_NOW, type Sql } from "../db";
import type {
  AdminReservation,
  MyReservation,
  ReservationPhoto,
} from "../../../shared/api-types";
import { defaultDueAtIso } from "../../../shared/rental-period";

// D1 의 json_group_array 는 TEXT 를 돌려주고, 행이 없으면 NULL 이다.
// 화면 계약은 항상 배열이므로 여기서 [] 로 정규화한다.
function parseReturnPhotos(value: unknown): ReservationPhoto[] {
  if (typeof value === "string") {
    return JSON.parse(value) as ReservationPhoto[];
  }
  return (value ?? []) as ReservationPhoto[];
}

// 대여 가능 아이템 조회 (사전 검사용) — 세 영역의 합계까지 함께 읽는다.
// 실제 허용 판정은 createReservation 의 단일 INSERT 가드가 다시 수행한다.
export type ReserveItem = {
  id: number;
  lifecycle: string;
  kind: string;
  total_qty: number;
  qty_repair: number;
  rented_qty: number;
  pending_qty: number;
  reserved_qty: number;
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

// 한 신청이 만든 행 — pending 과 reserved 가 함께 있을 수 있다.
export type ReservationSegment = {
  id: number;
  status: "pending" | "reserved";
  qty: number;
};

// 결과 타입 — 호출자가 switch/discriminated union으로 처리
type ReservationResult =
  | { ok: true; group_id: string; segments: ReservationSegment[] }
  | { error: "not_found" }
  | { error: "item_not_active" }
  | { error: "consumable" }
  | { error: "too_many"; rentable: number }
  | { error: "queue_full"; max_request: number; rentable: number }
  | { error: "no_availability" };

// 1단계 사전 검사 — 오류 코드 구분용 (가용성은 아래 단일 문장이 보장)
async function getItemForReservation(
  db: Sql,
  itemId: number,
): Promise<ReserveItem | null> {
  const [row] = (await db.query(
    `SELECT items.id, items.lifecycle, items.kind, items.total_qty, items.qty_repair,
            (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
              WHERE r.item_id = items.id AND r.status = 'rented') AS rented_qty,
            (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
              WHERE r.item_id = items.id AND r.status = 'pending') AS pending_qty,
            (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
              WHERE r.item_id = items.id AND r.status = 'reserved') AS reserved_qty
       FROM items WHERE items.id = ?1`,
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
  | { error: "too_many"; rentable: number }
  | { error: "queue_full"; max_request: number; rentable: number } {
  // 폐기(lifecycle='retired')면 대여 불가. '수리중'은 아래 수량(rentable)에서 걸러진다
  if (item.lifecycle !== "active") return { error: "item_not_active" };
  // 소모품은 대여 대상이 아니다 ()
  if (item.kind === "consumable") return { error: "consumable" };
  const rentable = item.total_qty - item.qty_repair;
  if (params.qty > rentable) return { error: "too_many", rentable };

  // 신규가 지금 받을 수 있는 양 + 예약할 수 있는 양. reserved 는 아직 점유가 아니지만
  // 대기열에 우선권이 있으므로 신규 배정에서 빼 둔다.
  const free = Math.max(0, rentable - item.rented_qty - item.pending_qty);
  const available = Math.max(0, free - item.reserved_qty);
  const queue_capacity = Math.max(0, rentable - item.reserved_qty);
  const max_request = Math.min(rentable, available + queue_capacity);
  if (params.qty > max_request) {
    return { error: "queue_full", max_request, rentable };
  }
  return { ok: true };
}

// 2단계 — 실제 대여 생성. 한 신청을 pending/reserved 두 행으로 나누되,
// 두 분기가 같은 유효성 조건을 공유하는 단일 INSERT 로 원자 처리한다.
// D1 batch 에서 0행 INSERT 는 오류가 아니므로 INSERT 두 개를 나누면 부분 상태가 생긴다.
export async function createReservation(
  db: Sql,
  params: CreateReservationParams,
): Promise<ReservationResult> {
  const { itemId, memberId, memo, qty } = params;
  const dueAt = params.dueAt ?? defaultDueAtIso();
  const groupId = crypto.randomUUID();

  // 사전 검사 — 빠른 오류 응답용. 가용성은 실제 INSERT에서 보장
  const item = await getItemForReservation(db, itemId);
  if (!item) return { error: "not_found" };

  const validation = validateReservation(item, { qty });
  if ("error" in validation) return validation;

  // 단일 문장 — p(현재 재고) → s(유효성 + 분해) → 두 행 INSERT.
  // 유효성 조건이 s 에 있으므로 두 분기가 모두 0행이거나 모두 삽입된다.
  // 스냅샷 2개는 이력이 '그 시점의 물품명·위치'를 남기기 위해서다
  // (0004_rental_history.sql). 위치는 0005 부터 locations 참조라 이름을 join 으로 푼다.
  let rows: { id: number; status: string; qty: number }[];
  try {
    rows = (await db.query(
      `WITH p AS (
         SELECT ?1 AS item_id, ?2 AS member_id, ?3 AS memo, ?4 AS req,
                ?5 AS due_at, ?6 AS group_id,
                (SELECT total_qty - qty_repair FROM items WHERE id = ?1) AS r,
                (SELECT COALESCE(SUM(qty), 0) FROM reservations
                  WHERE item_id = ?1 AND status = 'rented') AS rented,
                (SELECT COALESCE(SUM(qty), 0) FROM reservations
                  WHERE item_id = ?1 AND status = 'pending') AS pending,
                (SELECT COALESCE(SUM(qty), 0) FROM reservations
                  WHERE item_id = ?1 AND status = 'reserved') AS reserved,
                (SELECT lifecycle FROM items WHERE id = ?1) AS lifecycle,
                (SELECT kind FROM items WHERE id = ?1) AS kind,
                (SELECT name FROM items WHERE id = ?1) AS item_name,
                (SELECT l.name FROM locations l
                   JOIN items i ON i.location_id = l.id WHERE i.id = ?1) AS item_location,
                (SELECT affiliation FROM members WHERE id = ?2) AS member_affiliation
       ),
       s AS (
         SELECT *,
                MAX(0, r - rented - pending - reserved) AS new_cap,
                MAX(0, r - reserved) AS queue_cap
           FROM p
          WHERE lifecycle = 'active'
            AND kind <> 'consumable'
            AND req <= r
            AND req <= MAX(0, r - rented - pending - reserved)
                     + MAX(0, r - reserved)
       )
       INSERT INTO reservations (
         item_id, member_id, member_memo, qty, due_at, status, group_id,
         item_name_snapshot, item_location_snapshot, member_affiliation_snapshot
       )
       SELECT item_id, member_id, memo, MIN(req, new_cap), due_at, 'pending', group_id,
              item_name, item_location, member_affiliation
         FROM s
        WHERE MIN(req, new_cap) > 0
       UNION ALL
       SELECT item_id, member_id, memo, req - MIN(req, new_cap), NULL, 'reserved', group_id,
              item_name, item_location, member_affiliation
         FROM s
        WHERE req - MIN(req, new_cap) > 0
       RETURNING id, status, qty`,
      [itemId, memberId, memo, qty, dueAt, groupId],
    )) as { id: number; status: string; qty: number }[];
  } catch (err) {
    // 신청 사이 물품 삭제 — FK 위반은 '수량 없음'이 아니므로 404로 구분
    if (err instanceof Error && /FOREIGN KEY constraint failed/.test(err.message)) {
      return { error: "not_found" };
    }
    throw err;
  }

  if (rows.length > 0) {
    return {
      ok: true,
      group_id: groupId,
      segments: rows.map((row) => ({
        id: row.id,
        status: row.status as "pending" | "reserved",
        qty: row.qty,
      })),
    };
  }

  // 0행 — 가드가 거절했다(재고·상태 변경 또는 물품 삭제). 재조회로 원인을 가린다.
  const cur = await getItemForReservation(db, itemId);
  if (!cur) return { error: "not_found" };
  const again = validateReservation(cur, { qty });
  if ("error" in again) return again;
  return { error: "no_availability" };
}

// ===== 알림용 대여 정보 =====
// 이력 표기는 스냅샷을 우선한다 — 물품이 개명돼도 알림에는 그 시점 이름을 쓴다.
export type ReservationNotice = {
  itemName: string;
  qty: number;
  memberName: string;
  dueAt: string | null;
  returnNote: string | null;
};

export async function getReservationNotice(
  db: Sql,
  reservationId: number,
): Promise<ReservationNotice | null> {
  const [row] = (await db.query(
    `SELECT COALESCE(r.item_name_snapshot, items.name) AS item_name,
            r.qty, r.due_at, r.return_note,
            members.name AS member_name
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members ON members.id = r.member_id
      WHERE r.id = ?1`,
    [reservationId],
  )) as {
    item_name: string;
    qty: number;
    due_at: string | null;
    return_note: string | null;
    member_name: string;
  }[];
  if (!row) return null;
  return {
    itemName: row.item_name,
    qty: row.qty,
    memberName: row.member_name,
    dueAt: row.due_at,
    returnNote: row.return_note,
  };
}

// ===== 내 대여 조회 () =====
export async function getMyReservations(
  db: Sql,
  memberId: string,
): Promise<MyReservation[]> {
  const rows = (await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || COALESCE(p.thumb_r2_key, p.r2_key) || '?access=members' FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.qty, r.status, r.member_memo, r.return_note,
            r.created_at, r.updated_at,
            r.group_id,
            r.due_at,
            (r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}) AS is_overdue,
            -- 예약 건에서 앞에 대기 중인 수량. pending/rented 등 다른 상태는 0.
            CASE WHEN r.status = 'reserved' THEN
              (SELECT COALESCE(SUM(r2.qty), 0) FROM reservations r2
                WHERE r2.item_id = r.item_id AND r2.status = 'reserved'
                  AND (r2.created_at < r.created_at
                       OR (r2.created_at = r.created_at AND r2.id < r.id)))
            ELSE 0 END AS queue_ahead_qty,
            r.decided_at, r.rejected_reason,
            (SELECT json_group_array(json_object(
                      'id', p.id,
                      'url', '/api/photos/' || p.r2_key,
                      'uploaded_role', p.uploaded_role))
               FROM (SELECT id, r2_key, uploaded_role FROM reservation_photos
                      WHERE reservation_id = r.id ORDER BY sort_order) p) AS return_photos
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = ?1
      ORDER BY r.created_at DESC`,
    [memberId],
  )) as (Omit<MyReservation, "is_overdue" | "return_photos"> & {
    is_overdue: number;
    return_photos: unknown;
  })[];
  // SQLite 는 boolean 식을 0/1 로 돌려준다 — API 계약(boolean)을 유지한다
  return rows.map((row) => ({
    ...row,
    is_overdue: row.is_overdue !== 0,
    return_photos: parseReturnPhotos(row.return_photos),
  }));
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
  extraParams: unknown[] = [],
): Promise<OwnActionResult> {
  const rows = (await db.query(sql, [
    reservationId,
    memberId,
    ...extraParams,
  ])) as {
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
  // 신청 대기(pending)·예약(reserved)·대여 중(rented)인 본인 건만 취소할 수 있다.
  // 반납·거절 완료 건은 이력이므로 되돌리지 않는다.
  return ownAction(
    db,
    reservationId,
    memberId,
    `UPDATE reservations SET status = 'cancelled', updated_at = ${SQL_NOW}
      WHERE id = ?1 AND member_id = ?2 AND status IN ('pending', 'reserved', 'rented')
      RETURNING id`,
  );
}

// 그룹 취소 — 한 신청의 아직 시작되지 않은 행(pending/reserved)을 모두 취소한다.
// 이미 rented 가 된 행은 남긴다(반납 또는 개별 취소로 처리).
export async function cancelReservationGroup(
  db: Sql,
  groupId: string,
  memberId: string,
): Promise<OwnActionResult> {
  const rows = (await db.query(
    `UPDATE reservations SET status = 'cancelled', updated_at = ${SQL_NOW}
      WHERE group_id = ?1 AND member_id = ?2 AND status IN ('pending', 'reserved')
      RETURNING id`,
    [groupId, memberId],
  )) as { id: number }[];
  if (rows.length > 0) return { ok: true };

  const found = (await db.query(
    `SELECT member_id FROM reservations WHERE group_id = ?1`,
    [groupId],
  )) as { member_id: string }[];
  if (found.length === 0 || found[0].member_id !== memberId) {
    return { error: "not_found" };
  }
  return { error: "bad_status" };
}

// 반납 특이사항 — 선택 입력. 공백만 있으면 없는 것으로 보고 500자에서 자른다.
export function normalizeReturnNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 500);
  return trimmed || null;
}

// 반납 — 회원이 직접 처리한다. 관리자 경로(returnReservation)와 달리 admin_id 를 건드리지 않는다.
// admin_id 는 '처리한 관리자'를 뜻하므로 회원이 반납한 건은 NULL 로 남고, 그 자체가
// "회원이 직접 반납했다"는 사실을 담는다 — 관리자 목록이 이 값으로 구분해 보여준다.
// 회원의 반납은 자기 신고이므로 관리자는 목록에서 그 건을 따로 확인할 수 있어야 한다.
export async function returnReservationByMember(
  db: Sql,
  reservationId: number,
  memberId: string,
  note: string | null = null,
): Promise<OwnActionResult> {
  return ownAction(
    db,
    reservationId,
    memberId,
    `UPDATE reservations SET status = 'returned', returned_at = ${SQL_NOW}, return_note = ?3, updated_at = ${SQL_NOW}
      WHERE id = ?1 AND member_id = ?2 AND status = 'rented'
      RETURNING id`,
    [note],
  );
}

// ===== 관리자: 목록·상태 전이 () =====

export const RESERVATION_STATUSES = [
  "pending",
  "reserved",
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

// 관리자 목록 — 대기(pending/reserved)가 맨 위, 그 안에서는 오래된 순(FIFO).
// 반납 예정일이 지난 대여 중 건이 그다음, 나머지는 최근 신청순이다.
// 날짜가 없어져 초과 경고(conflict_count)도 없다: 신청 가드가 점유 수량을 직접 세므로
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
    `WITH stock AS (
       SELECT item_id,
              SUM(CASE WHEN status = 'rented'   THEN qty ELSE 0 END) AS rented_qty,
              SUM(CASE WHEN status = 'pending'  THEN qty ELSE 0 END) AS pending_qty,
              SUM(CASE WHEN status = 'reserved' THEN qty ELSE 0 END) AS reserved_qty
         FROM reservations
        GROUP BY item_id
     )
     SELECT r.id, r.item_id,
            -- 이력 표기는 스냅샷을 우선한다 — 물품이 개명돼도 이 표는 그 시점의 이름이다.
            -- 스냅샷이 비어 있으면(마이그레이션 이전 행 등) 현재 이름으로 물러난다.
            COALESCE(r.item_name_snapshot, items.name) AS item_name,
            r.item_name_snapshot, r.item_location_snapshot, r.returned_at,
            r.due_at,
            (r.status = 'rented' AND r.due_at IS NOT NULL AND r.due_at < ${SQL_NOW}) AS is_overdue,
            items.total_qty,
            (items.total_qty - items.qty_repair) AS item_rentable_qty,
            COALESCE(stock.rented_qty, 0)   AS item_rented_qty,
            COALESCE(stock.pending_qty, 0)  AS item_pending_qty,
            COALESCE(stock.reserved_qty, 0) AS item_reserved_qty,
            r.qty, r.group_id,
            -- 예약 건에서 앞에 대기 중인 수량 (FIFO 표시용)
            CASE WHEN r.status = 'reserved' THEN
              (SELECT COALESCE(SUM(r2.qty), 0) FROM reservations r2
                WHERE r2.item_id = r.item_id AND r2.status = 'reserved'
                  AND (r2.created_at < r.created_at
                       OR (r2.created_at = r.created_at AND r2.id < r.id)))
            ELSE 0 END AS queue_ahead_qty,
            r.member_id, m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
            m.affiliation AS member_affiliation,
            r.member_affiliation_snapshot,
            r.status, r.member_memo, r.return_note,
            r.decided_at, r.rejected_reason,
            d.name AS decided_by_name,
            a.name AS admin_name, r.created_at, r.updated_at,
            -- 누가 반납 처리했는가 — 반납은 관리자와 회원이 모두 할 수 있다.
            -- admin_id 는 '처리한 관리자'라, 비어 있는 returned 행은 회원이 직접 반납한 것이다.
            -- 회원 반납은 자기 신고이므로 관리자가 목록에서 구분해 확인할 수 있어야 한다.
            (r.status = 'returned' AND r.admin_id IS NULL) AS returned_by_member,
            -- 승인 가능 여부(파생). pending 은 이미 점유된 몫이라 상태만 보면 된다.
            -- reserved 는 승인 시점에 새로 점유하므로 현재 점유 합계를 다시 센다.
            (r.status = 'pending'
             AND items.lifecycle = 'active' AND items.kind <> 'consumable') AS approvable_pending,
            (r.status = 'reserved'
             AND items.lifecycle = 'active' AND items.kind <> 'consumable'
             AND r.qty + COALESCE(stock.rented_qty, 0) + COALESCE(stock.pending_qty, 0)
                 <= items.total_qty - items.qty_repair) AS approvable_reserved,
            (SELECT json_group_array(json_object(
                      'id', p.id,
                      'url', '/api/photos/' || p.r2_key,
                      'uploaded_role', p.uploaded_role))
               FROM (SELECT id, r2_key, uploaded_role FROM reservation_photos
                      WHERE reservation_id = r.id ORDER BY sort_order) p) AS return_photos
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN members a ON a.id = r.admin_id
       LEFT JOIN members d ON d.id = r.decided_by
       LEFT JOIN stock ON stock.item_id = r.item_id
      WHERE ${where}
      ORDER BY
        CASE WHEN r.status IN ('pending', 'reserved') THEN 0 ELSE 1 END,
        CASE WHEN r.status IN ('pending', 'reserved') THEN r.created_at END ASC,
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
    approvable_pending: number;
    approvable_reserved: number;
    return_photos: unknown;
  })[]).map(({ approvable_pending, approvable_reserved, ...r }) => ({
    ...r,
    returned_by_member: r.returned_by_member !== 0,
    is_overdue: r.is_overdue !== 0,
    approvable: approvable_pending !== 0 || approvable_reserved !== 0,
    return_photos: parseReturnPhotos(r.return_photos),
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
        | "due_date_required"
        | "no_availability";
    };

export type RejectResult =
  | { ok: true }
  | { error: "not_found" | "bad_status" | "reason_required" };

// 승인 — pending/reserved → rented.
// pending 은 신청 시 재고를 점유했으므로 rented 와의 합만 확인하고,
// reserved 는 승인 시점에 새로 점유하므로 rented + pending 까지 더해 확인한다.
// 상태·물품 생애주기·가용 수량 가드를 한 UPDATE 에 넣어 동시 승인에도 하나만 성공한다.
export async function approveReservation(
  db: Sql,
  reservationId: number,
  adminId: string,
  dueAtOverride?: string | null,
): Promise<ApprovalResult> {
  const [res] = (await db.query(
    `SELECT status, item_id, due_at FROM reservations WHERE id = ?1`,
    [reservationId],
  )) as { status: string; item_id: number; due_at: string | null }[];
  if (!res) return { error: "not_found" };
  if (res.status !== "pending" && res.status !== "reserved") {
    return { error: "bad_status" };
  }

  // 반납일 확정 — pending 은 희망일을 쓰고, 지났으면 새 날짜가 필수다.
  // reserved 는 희망일이 없으므로 기본값(오늘 + 7일)을 쓴다. 관리자는 언제든 덮어쓸 수 있다.
  const nowIso = new Date().toISOString();
  let dueAt: string;
  if (dueAtOverride) {
    dueAt = dueAtOverride;
  } else if (res.status === "reserved") {
    dueAt = defaultDueAtIso();
  } else if (res.due_at && res.due_at >= nowIso) {
    dueAt = res.due_at;
  } else {
    return { error: "due_date_required" };
  }

  const rows = (await db.query(
    `UPDATE reservations
        SET status = 'rented', decided_by = ?2,
            decided_at = ${SQL_NOW}, updated_at = ${SQL_NOW}, due_at = ?3
      WHERE id = ?1 AND status IN ('pending', 'reserved')
        AND EXISTS (SELECT 1 FROM items
                     WHERE items.id = reservations.item_id
                       AND lifecycle = 'active' AND kind <> 'consumable')
        AND (
          (status = 'pending'
           AND qty + COALESCE((SELECT SUM(r.qty) FROM reservations r
                                WHERE r.item_id = reservations.item_id
                                  AND r.status = 'rented'), 0)
               <= (SELECT total_qty - qty_repair FROM items
                    WHERE items.id = reservations.item_id))
          OR
          (status = 'reserved'
           AND qty + COALESCE((SELECT SUM(r.qty) FROM reservations r
                                WHERE r.item_id = reservations.item_id
                                  AND r.status IN ('rented', 'pending')), 0)
               <= (SELECT total_qty - qty_repair FROM items
                    WHERE items.id = reservations.item_id))
        )
      RETURNING id`,
    [reservationId, adminId, dueAt],
  )) as { id: number }[];
  if (rows.length > 0) return { ok: true };

  // 0행 — 상태가 바뀌었거나 물품 상태·재고가 거절했다. 재조회로 원인을 가른다.
  const [cur] = (await db.query(
    `SELECT status, item_id FROM reservations WHERE id = ?1`,
    [reservationId],
  )) as { status: string; item_id: number }[];
  if (!cur) return { error: "not_found" };
  if (cur.status !== "pending" && cur.status !== "reserved") {
    return { error: "bad_status" };
  }

  const [item] = (await db.query(
    `SELECT lifecycle, kind FROM items WHERE id = ?1`,
    [cur.item_id],
  )) as { lifecycle: string; kind: string }[];
  if (!item) return { error: "not_found" };
  if (item.lifecycle !== "active") return { error: "item_not_active" };
  if (item.kind === "consumable") return { error: "consumable" };
  return { error: "no_availability" };
}

// 거절 — pending/reserved → rejected. 사유는 필수이며 이력에 남긴다.
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
      WHERE id = ?1 AND status IN ('pending', 'reserved')
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
  note: string | null = null,
): Promise<TransitionResult> {
  return transition(
    db,
    reservationId,
    `UPDATE reservations SET status = 'returned', returned_at = ${SQL_NOW}, admin_id = ?2, return_note = ?3, updated_at = ${SQL_NOW}
      WHERE id = ?1 AND status = 'rented' RETURNING id`,
    [reservationId, adminId, note],
  );
}
