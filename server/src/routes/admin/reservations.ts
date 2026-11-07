import { Hono, type Context } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import { validatePhotoFile } from "../../photo-upload";
import { MAX_RETURN_PHOTOS } from "../../../../shared/photo-limits";
import {
  dueAtFromKstDate,
  isDueDateInRange,
  isIsoDate,
} from "../../../../shared/rental-period";
import {
  RESERVATION_STATUSES,
  listReservations,
  normalizeReturnNote,
  returnReservation,
  approveReservation,
  rejectReservation,
  type TransitionResult,
} from "../../services/reservations.service";
import {
  addReturnPhoto,
  deleteReturnPhoto,
} from "../../services/reservation-photos.service";

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

// 승인 — pending/reserved → rented. 재고를 다시 확인하고 반납일을 확정한다.
// due_date 는 KST 달력 날짜이며, 없으면 pending 은 저장된 희망일, reserved 는 오늘+7일을 쓴다.
adminReservationsRoute.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const dueDateRaw = typeof body.due_date === "string" ? body.due_date.trim() : "";
  let dueAt: string | null = null;
  if (dueDateRaw) {
    if (!isIsoDate(dueDateRaw)) return c.json({ error: "bad_due_date" }, 400);
    if (!isDueDateInRange(dueDateRaw)) {
      return c.json({ error: "due_date_out_of_range" }, 400);
    }
    dueAt = dueAtFromKstDate(dueDateRaw);
    if (!dueAt) return c.json({ error: "bad_due_date" }, 400);
  }

  const db: Sql = getDb(c.env);
  const result = await approveReservation(db, id, c.get("user")!.id, dueAt);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "bad_status") return c.json({ error: "bad_status" }, 409);
  if (result.error === "due_date_required")
    return c.json({ error: "due_date_required" }, 409);
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
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await returnReservation(
    db,
    id,
    c.get("user")!.id,
    normalizeReturnNote(body.note),
  );
  return mapTransition(c, result);
});

// ===== 반납 상태 사진 =====
// 관리자는 물품을 회수할 때 확인 사진을 남긴다. 회원 사진과 같은 테이블에
// uploaded_role='admin' 으로 쌓여 화면에서 구분된다. 업로드는 대여 중(rented)에만.

adminReservationsRoute.post("/:id/photos", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const form = await c.req.formData();
  const file = form.get("file") as unknown;
  if (!(file instanceof File)) return c.json({ error: "file 필드 필요" }, 400);
  const checked = await validatePhotoFile(file);
  if (!checked.ok) return c.json({ error: checked.error }, checked.status);

  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const result = await addReturnPhoto(db, c.env, {
    reservationId: id,
    actor: { id: user.id, role: "admin" },
    file,
    ext: checked.ext,
  });

  if ("ok" in result) return c.json({ id: result.id, url: result.url }, 201);
  if (result.error === "too_many") {
    return c.json({ error: `사진은 최대 ${MAX_RETURN_PHOTOS}장` }, 409);
  }
  if (result.error === "bad_status") {
    return c.json({ error: "bad_status" }, 409);
  }
  return c.json({ error: "not_found" }, 404);
});

// 관리자는 반납 완료 건의 사진도 정정할 수 있다 — 증빙의 품질을 관리하는 경로.
adminReservationsRoute.delete("/:id/photos/:photoId", async (c) => {
  const id = Number(c.req.param("id"));
  const photoId = Number(c.req.param("photoId"));
  if (!Number.isInteger(id) || !Number.isInteger(photoId)) {
    return c.json({ error: "bad_id" }, 400);
  }
  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const ok = await deleteReturnPhoto(db, c.env, {
    reservationId: id,
    photoId,
    actor: { id: user.id, role: "admin" },
  });
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
