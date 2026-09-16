import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { requireApproved } from "../middleware/auth";
import { kstToday } from "../dates";
import {
  createReservation,
  getMyReservations,
  cancelReservation,
  type CreateReservationParams,
} from "../services/reservations.service";

// ===== 예약 라우트 =====
// SPEC §3·§7.4 — 대여 신청/내 예약/취소 (approved 회원 전용, §8)
// 상태 전이(승인/거절/수령/반납)는 관리자 전용 /api/admin/reservations 에만 있다 — 여기 두지 않는다
export const reservationsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

reservationsRoute.use("*", requireApproved);

// 날짜 검증 — YYYY-MM-DD 형식 + 실존하는 날짜(2026-02-30 등 차단)
function isDateStr(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}

// 신청 — 가용 검사는 reservations.service.createReservation에 위임 (§8)
// 동시 신청에도 이중 예약 불가 (advisory 락 + 일별 점유 검사)
reservationsRoute.post("/", async (c) => {
  const user = c.get("user")!;

  // 수령·반납 연락용 — 미등록 회원은 프로필 입력으로 유도 (§4.1)
  if (!user.phone) return c.json({ error: "phone_required" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const itemId = Number(body.item_id);
  if (!Number.isInteger(itemId)) return c.json({ error: "bad_id" }, 400);
  const { start_date, end_date } = body;
  if (!isDateStr(start_date) || !isDateStr(end_date))
    return c.json({ error: "bad_date" }, 400);

  // 반개구간 [start, end) — end_date는 반납일이며 대여일에서 제외 (§8 겹침 조건과 동일 기준)
  const days = Math.round(
    (Date.parse(end_date) - Date.parse(start_date)) / 86400000,
  );
  if (days < 1) return c.json({ error: "bad_range" }, 400);
  const today = kstToday();
  if (start_date < today) return c.json({ error: "past_date" }, 400);
  const memo =
    typeof body.memo === "string" && body.memo.trim()
      ? body.memo.trim().slice(0, 500)
      : null;

  // 부분 대여 수량 — 한 예약이 여러 개를 점유한다 (P0). 미지정은 1개.
  const qty = body.qty === undefined ? 1 : Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1)
    return c.json({ error: "bad_qty" }, 400);

  const db: Sql = getDb(c.env);
  const params: CreateReservationParams = {
    itemId,
    memberId: user.id,
    startDate: start_date,
    endDate: end_date,
    memo,
    qty,
    days,
  };

  // 가용성 검사 + 예약 생성 (advisory 락 + 일별 점유 검사 포함, §8)
  const result = await createReservation(db, params);

  if ("ok" in result) {
    return c.json({ id: result.id }, 201);
  }

  // 에러 처리
  if (result.error === "consumable")
    return c.json({ error: "consumable" }, 409);
  if (result.error === "item_not_active")
    return c.json({ error: "item_not_active" }, 409);
  if (result.error === "too_long") return c.json({ error: "too_long" }, 400);
  if (result.error === "too_many") return c.json({ error: "too_many" }, 400);
  if (result.error === "no_availability")
    return c.json({ error: "no_availability" }, 409);
  if (result.error === "busy") return c.json({ error: "busy" }, 409);
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);

  return c.json({ error: "internal" }, 500);
});

// 내 예약 현황·이력 (§4.1, member_id = 세션 사용자 필수, §8)
reservationsRoute.get("/mine", async (c) => {
  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const rows = await getMyReservations(db, user.id);
  return c.json({ reservations: rows });
});

// 신청 취소 — 본인 + 수령 전(pending/approved)만 (§3)
reservationsRoute.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const result = await cancelReservation(db, id, user.id);

  if ("ok" in result) return c.json({ ok: true });
  // 없음/타인 건 → not_found, 종료 상태 → bad_status
  if (result.error === "bad_status")
    return c.json({ error: "bad_status" }, 409);
  return c.json({ error: "not_found" }, 404);
});
