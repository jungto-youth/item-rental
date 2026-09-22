import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  createReservation,
  getMyReservations,
  cancelReservation,
  returnReservationByMember,
  type CreateReservationParams,
} from "../services/reservations.service";

// ===== 대여 라우트 =====
// 대여/내 대여/취소/반납 (로그인 회원 전용 — 승인 단계 없음)
// 관리자 전용 /api/admin/reservations 에는 반납만 있다 — 회원도 같은 일을 할 수 있으므로
// 여기에도 반납을 둔다. 두 경로의 차이는 admin_id 기록 여부뿐이다 (service 주석 참고)
export const reservationsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// 로그인 필수 — requireAuth가 세션 사용자를 조회해 c.set("user") ()
// 1e622e3이 requireApproved 삭제 시 함께 지워 /api/reservations/* 가 500 을 냈던 줄 복원
reservationsRoute.use("*", requireAuth);

// 신청 — 가용 검사는 reservations.service.createReservation에 위임
// 동시 신청에도 이중 대여 불가 (advisory 락 + 대여 중 수량 검사)
reservationsRoute.post("/", async (c) => {
  const user = c.get("user")!;

  // 수령·반납 연락용 — 미등록 회원은 프로필 입력으로 유도 ()
  if (!user.phone) return c.json({ error: "phone_required" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const itemId = Number(body.item_id);
  if (!Number.isInteger(itemId)) return c.json({ error: "bad_id" }, 400);

  const memo =
    typeof body.memo === "string" && body.memo.trim()
      ? body.memo.trim().slice(0, 500)
      : null;

  // 부분 대여 수량 — 한 대여가 여러 개를 점유한다. 미지정은 1개.
  const qty = body.qty === undefined ? 1 : Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1)
    return c.json({ error: "bad_qty" }, 400);

  const db: Sql = getDb(c.env);
  const params: CreateReservationParams = {
    itemId,
    memberId: user.id,
    memo,
    qty,
  };

  // 가용성 검사 + 대여 생성 (advisory 락 + 대여 중 수량 검사 포함)
  const result = await createReservation(db, params);

  if ("ok" in result) {
    return c.json({ id: result.id }, 201);
  }

  // 에러 처리
  if (result.error === "consumable")
    return c.json({ error: "consumable" }, 409);
  if (result.error === "item_not_active")
    return c.json({ error: "item_not_active" }, 409);
  if (result.error === "too_many") return c.json({ error: "too_many" }, 400);
  if (result.error === "no_availability")
    return c.json({ error: "no_availability" }, 409);
  if (result.error === "busy") return c.json({ error: "busy" }, 409);
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);

  return c.json({ error: "internal" }, 500);
});

// 내 대여 현황·이력  — member_id = 세션 사용자 필수
reservationsRoute.get("/mine", async (c) => {
  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const rows = await getMyReservations(db, user.id);
  return c.json({ reservations: rows });
});

// 대여 취소 — 본인 + 대여 중(rented)만 ()
// 취소는 "빌리지 않기로 함", 반납은 "돌려줬음" — 둘 다 재고를 즉시 되돌린다
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

// 반납 — 회원이 물품을 돌려주고 직접 처리한다 (). 본인 + 대여 중(rented)만.
// 관리자에게 물어보지 않아도 되게 하되, admin_id 는 비워 두어 관리자 목록이
// '회원이 직접 반납'을 구분해 볼 수 있게 한다
reservationsRoute.post("/:id/return", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const result = await returnReservationByMember(db, id, user.id);

  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "bad_status")
    return c.json({ error: "bad_status" }, 409);
  return c.json({ error: "not_found" }, 404);
});
