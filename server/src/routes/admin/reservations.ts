import { Hono, type Context } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  RESERVATION_STATUSES,
  listReservations,
  approveReservation,
  rejectReservation,
  pickupReservation,
  returnReservation,
  type TransitionResult,
} from "../../services/reservations.service";

// SPEC §4.3 — 대여 신청 승인/거절/수령/반납 (admin 전용)
// 조건부 전이의 존재/상태 구분은 reservations.service 가 한다
export const adminReservationsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminReservationsRoute.use("*", requireAdmin);

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

// 전이 결과 공용 매핑 — 기대 상태가 아니면 없음(404) vs 잘못된 전이(409) 구분
function mapTransition(c: Ctx, result: TransitionResult): Response {
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  return c.json({ error: "bad_status" }, 409);
}

// 목록 — pending이 맨 위, 최근 신청순. pending 행의 초과 경고용 conflict_count 포함 (§3)
adminReservationsRoute.get("/", async (c) => {
  const status = c.req.query("status") || null;
  if (status && !RESERVATION_STATUSES.includes(status))
    return c.json({ error: "bad_status" }, 400);

  const db: Sql = getDb(c.env);
  const { reservations, truncated } = await listReservations(db, status);
  return c.json({ reservations, truncated });
});

// 승인 — pending → approved. 관리자는 승인 시 수량을 줄일 수 있다 (§4.3)
adminReservationsRoute.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { qty?: unknown };

  // 수량 조정 (§3) — 재고가 모자랄 때 현장에서 줄이는 용도다.
  // 줄이는 것만 허용한다: pending은 이미 일별 점유 가드에 포함돼 있어 감소는 안전이 보장되지만,
  // 증가는 그 시점의 잔여 수량을 다시 계산해야 하고 그 검사를 빼으면 이중 배정이 난다.
  // 늘려야 하면 거절 후 재신청이 정확하다 — 회원이 신청하지 않은 수량을 관리자가 임의로
  // 배정하면 신청 기록과 실제 출고가 어긋난다.
  let qty: number | null = null;
  if (body.qty !== undefined) {
    const n = Number(body.qty);
    if (!Number.isInteger(n) || n < 1) return c.json({ error: "bad_qty" }, 400);
    qty = n;
  }

  const db: Sql = getDb(c.env);
  const result = await approveReservation(db, id, c.get("user")!.id, qty);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "qty_increase_not_allowed") {
    return c.json({ error: "qty_increase_not_allowed" }, 400);
  }
  return mapTransition(c, result);
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
  const result = await rejectReservation(db, id, c.get("user")!.id, reason);
  return mapTransition(c, result);
});

// 수령 — approved → picked_up
adminReservationsRoute.post("/:id/pickup", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const result = await pickupReservation(db, id, c.get("user")!.id);
  return mapTransition(c, result);
});

// 반납 — picked_up → returned
adminReservationsRoute.post("/:id/return", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const result = await returnReservation(db, id, c.get("user")!.id);
  return mapTransition(c, result);
});
