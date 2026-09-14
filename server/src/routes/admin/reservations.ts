import { Hono, type Context } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireManager } from "../../middleware/auth";
import { KST_TODAY } from "../../dates";

// SPEC §4.3 — 대여 신청 승인/거절/수령/반납 (manager 이상)
export const adminReservationsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminReservationsRoute.use("*", requireManager);

const STATUSES = [
  "pending",
  "approved",
  "picked_up",
  "returned",
  "rejected",
  "cancelled",
];
type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

// 조건부 전이 공용 처리 — 기대 상태가 아니면 빈 결과 → 없음(404) vs 잘못된 전이(409) 구분
async function finish(
  c: Ctx,
  id: number,
  rows: { id: number }[],
): Promise<Response> {
  if (rows.length > 0) return c.json({ ok: true });
  const db: Sql = getDb(c.env);
  const found = (await db.query("SELECT id FROM reservations WHERE id = $1", [
    id,
  ])) as {
    id: number;
  }[];
  if (found.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ error: "bad_status" }, 409);
}

// 목록 — pending이 맨 위, 최근 신청순. pending 행의 초과 경고용 conflict_count 포함 (§3)
adminReservationsRoute.get("/", async (c) => {
  const status = c.req.query("status") || null;
  if (status && !STATUSES.includes(status))
    return c.json({ error: "bad_status" }, 400);

  const db: Sql = getDb(c.env);
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
  return c.json({ reservations: rows, truncated });
});

// 승인 — pending → approved. 관리자는 승인 시 수량을 줄일 수 있다 (§4.3)
adminReservationsRoute.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { qty?: unknown };

  // 수량 조정 (§3) — 재고가 모자랄 때 현장에서 줄이는 용도다.
  // 줄이는 것만 허용한다: pending은 이미 일별 점유 가드에 포함돼 있어 감소는 안전이 보장되지만,
  // 증가는 그 시점의 잔여 수량을 다시 계산해야 하고 그 검사를 빼면 이중 배정이 난다.
  // 늘려야 하면 거절 후 재신청이 정확하다 — 회원이 신청하지 않은 수량을 관리자가 임의로
  // 배정하면 신청 기록과 실제 출고가 어긋난다.
  let qty: number | null = null;
  if (body.qty !== undefined) {
    const n = Number(body.qty);
    if (!Number.isInteger(n) || n < 1) return c.json({ error: "bad_qty" }, 400);
    qty = n;
  }

  const db: Sql = getDb(c.env);
  if (qty !== null) {
    // 현재 신청 수량 — 초과(증가)는 명시적으로 거부해 bad_status와 구분한다
    const cur = (await db.query(
      `SELECT qty FROM reservations WHERE id = $1 AND status = 'pending'`,
      [id],
    )) as { qty: number }[];
    if (cur.length > 0 && qty > cur[0].qty)
      return c.json({ error: "qty_increase_not_allowed" }, 400);
  }

  const rows = (await db.query(
    // SQL 쪽 조건은 레이스 대비 — 위 SELECT와 UPDATE 사이에 회원이 취소하거나
    // 관리자가 먼저 처리했을 수 있다
    `UPDATE reservations SET status = 'approved', admin_id = $2, qty = COALESCE($3::int, qty),
            updated_at = now()
      WHERE id = $1 AND status = 'pending'
        AND ($3::int IS NULL OR $3::int <= qty)
      RETURNING id`,
    [id, c.get("user")!.id, qty],
  )) as { id: number }[];
  return finish(c, id, rows);
});

// 거절 — pending → rejected, 사유 필수 (§4.3)
adminReservationsRoute.post("/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return c.json({ error: "reason_required" }, 400);

  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `UPDATE reservations SET status = 'rejected', status_note = $2, admin_id = $3, updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, reason, c.get("user")!.id],
  )) as { id: number }[];
  return finish(c, id, rows);
});

// 수령 — approved → picked_up
adminReservationsRoute.post("/:id/pickup", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `UPDATE reservations SET status = 'picked_up', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'approved' RETURNING id`,
    [id, c.get("user")!.id],
  )) as { id: number }[];
  return finish(c, id, rows);
});

// 반납 — picked_up → returned
adminReservationsRoute.post("/:id/return", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `UPDATE reservations SET status = 'returned', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'picked_up' RETURNING id`,
    [id, c.get("user")!.id],
  )) as { id: number }[];
  return finish(c, id, rows);
});
