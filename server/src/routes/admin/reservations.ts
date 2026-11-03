import { Hono, type Context } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  RESERVATION_STATUSES,
  listReservations,
  returnReservation,
  approveReservation,
  rejectReservation,
  type TransitionResult,
} from "../../services/reservations.service";

// 대여 반납 처리 (admin 전용)
// 승인·거절·수령은 없다: 신청 즉시 대여 중이 되고 관리자는 반납만 누른다.
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

// 목록 — 대여 중이 맨 위, 최근 신청순
adminReservationsRoute.get("/", async (c) => {
  const status = c.req.query("status") || null;
  // 'overdue' 는 저장 상태가 아니라 파생 필터(대여 중 + 기한 지남)다.
  if (status && status !== "overdue" && !RESERVATION_STATUSES.includes(status))
    return c.json({ error: "bad_status" }, 400);

  const db: Sql = getDb(c.env);
  const { reservations, truncated } = await listReservations(db, status);
  return c.json({ reservations, truncated });
});

// 승인 — pending → rented. 재고·기한을 다시 확인한다.
adminReservationsRoute.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const result = await approveReservation(db, id, c.get("user")!.id);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "bad_status") return c.json({ error: "bad_status" }, 409);
  return c.json({ error: result.error }, 409);
});

// 거절 — pending → rejected. 사유는 필수다.
adminReservationsRoute.post("/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return c.json({ error: "reason_required" }, 400);

  const db: Sql = getDb(c.env);
  const result = await rejectReservation(db, id, c.get("user")!.id, reason);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "reason_required") {
    return c.json({ error: "reason_required" }, 400);
  }
  return c.json({ error: "bad_status" }, 409);
});

// 반납 — rented → returned
adminReservationsRoute.post("/:id/return", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const result = await returnReservation(db, id, c.get("user")!.id);
  return mapTransition(c, result);
});
