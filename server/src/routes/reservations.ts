import { Hono, type Context } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { requireAuth } from "../middleware/auth";
import { validatePhotoFile } from "../photo-upload";
import { MAX_RETURN_PHOTOS } from "../../../shared/photo-limits";
import { isAffiliationValid } from "../../../shared/affiliation";
import {
  defaultDueDateKst,
  dueAtFromKstDate,
  isDueDateInRange,
  isIsoDate,
} from "../../../shared/rental-period";
import {
  createReservation,
  getMyReservations,
  cancelReservation,
  cancelReservationGroup,
  normalizeReturnNote,
  returnReservationByMember,
  type CreateReservationParams,
} from "../services/reservations.service";
import {
  addReturnPhoto,
  deleteReservationPhotos,
  deleteReturnPhoto,
} from "../services/reservation-photos.service";
import {
  isTelegramConfigured,
  notifyReservationCreated,
  notifyReservationReturned,
} from "../services/telegram.service";

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

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

// 알림은 응답 뒤에 보낸다 — 텔레그램이 느리거나 실패해도 신청·반납은 이미 성공이다.
// ExecutionContext 가 없는 환경(단위 테스트·스크립트)에서는 그냥 실행하고 결과를 버린다.
function runInBackground(c: Ctx, work: () => Promise<unknown>): void {
  const task = work().catch((err) => {
    console.error("telegram: background task failed", err);
  });
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // ExecutionContext 가 없는 환경(단위 테스트·스크립트) — task 는 그대로 진행되고
    // 결과만 버려진다.
  }
}

// 알림에 필요한 물품 이름·위치 — 응답 경로에서 읽지 않고 백그라운드에서 조회한다.
async function loadItemLabel(
  db: Sql,
  itemId: number,
): Promise<{ itemName: string; locationName: string | null }> {
  const [item] = (await db.query(
    `SELECT items.name, l.name AS location_name
       FROM items LEFT JOIN locations l ON l.id = items.location_id
      WHERE items.id = ?1`,
    [itemId],
  )) as { name: string; location_name: string | null }[];
  return {
    itemName: item?.name ?? `물품 #${itemId}`,
    locationName: item?.location_name ?? null,
  };
}

// 신청 — 가용 검사는 reservations.service.createReservation에 위임
// 동시 신청에도 이중 대여 불가 (D1 batch 원자 가드 + 대여 중 수량 검사)
reservationsRoute.post("/", async (c) => {
  const user = c.get("user")!;

  // 수령·반납 연락용 — 미등록 회원은 프로필 입력으로 유도 ()
  if (!user.phone) return c.json({ error: "phone_required" }, 400);
  // 지부·지회·모둠도 필수 — 화면 가드를 우회한 직접 호출을 서버에서 막는다.
  if (!isAffiliationValid(user.affiliation))
    return c.json({ error: "affiliation_required" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const itemId = Number(body.item_id);
  if (!Number.isInteger(itemId)) return c.json({ error: "bad_id" }, 400);

  // 메모는 필수다 (B-07). 공백만 있는 값은 빈 값으로 본다. 기존 이력은 소급하지 않는다.
  const memoRaw = typeof body.memo === "string" ? body.memo.trim() : "";
  if (!memoRaw) return c.json({ error: "memo_required" }, 400);
  const memo = memoRaw.slice(0, 500);

  // 반납 예정일 (B-06) — KST 달력 날짜. 생략하면 기본 7일 뒤, 내일~30일만 허용.
  const dueDateRaw = typeof body.due_date === "string" ? body.due_date.trim() : "";
  const dueDate = dueDateRaw || defaultDueDateKst();
  if (!isIsoDate(dueDate)) return c.json({ error: "bad_due_date" }, 400);
  if (!isDueDateInRange(dueDate)) {
    return c.json({ error: "due_date_out_of_range" }, 400);
  }
  const dueAt = dueAtFromKstDate(dueDate);
  if (!dueAt) return c.json({ error: "bad_due_date" }, 400);

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
    dueAt,
  };

  // 가용성 검사 + 대여 생성 (가드 INSERT 원자 검사 포함)
  const result = await createReservation(db, params);

  if ("ok" in result) {
    // 관리자 알림 — 실패해도 응답에는 영향이 없다 (B-09 1단계)
    if (isTelegramConfigured(c.env)) {
      const pendingQty = result.segments
        .filter((segment) => segment.status === "pending")
        .reduce((sum, segment) => sum + segment.qty, 0);
      const reservedQty = result.segments
        .filter((segment) => segment.status === "reserved")
        .reduce((sum, segment) => sum + segment.qty, 0);
      runInBackground(c, async () => {
        const label = await loadItemLabel(db, itemId);
        await notifyReservationCreated(c.env, {
          ...label,
          qty,
          pendingQty,
          reservedQty,
          dueAt,
          memo,
          memberName: user.name,
          affiliation: user.affiliation,
        });
      });
    }
    return c.json(
      { group_id: result.group_id, segments: result.segments },
      201,
    );
  }

  // 에러 처리
  if (result.error === "consumable")
    return c.json({ error: "consumable" }, 409);
  if (result.error === "item_not_active")
    return c.json({ error: "item_not_active" }, 409);
  if (result.error === "too_many")
    return c.json({ error: "too_many", rentable: result.rentable }, 400);
  if (result.error === "queue_full")
    return c.json(
      { error: "queue_full", max_request: result.max_request },
      409,
    );
  if (result.error === "no_availability")
    return c.json({ error: "no_availability" }, 409);
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

// 대여 취소 — 본인 + 신청 대기(pending)·예약(reserved)·대여 중(rented)만
// 취소는 "빌리지 않기로 함", 반납은 "돌려줬음" — 둘 다 재고를 즉시 되돌린다
reservationsRoute.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const result = await cancelReservation(db, id, user.id);

  if ("ok" in result) {
    // 반납 확인 모달에서 올린 사진이 남아 있을 수 있다 — 취소는 이미 성공했으므로
    // 정리 실패가 응답을 바꾸지 않게 여기서 삼킨다.
    try {
      await deleteReservationPhotos(db, c.env, id);
    } catch (err) {
      console.error(`반납 사진 정리 실패 (reservation ${id})`, err);
    }
    return c.json({ ok: true });
  }
  // 없음/타인 건 → not_found, 종료 상태 → bad_status
  if (result.error === "bad_status")
    return c.json({ error: "bad_status" }, 409);
  return c.json({ error: "not_found" }, 404);
});

// 그룹 취소 — 한 신청이 pending/reserved 두 행으로 나뉜 경우 함께 취소한다.
// 이미 rented 가 된 행은 건드리지 않는다(개별 취소·반납으로 처리).
reservationsRoute.post("/groups/:groupId/cancel", async (c) => {
  const user = c.get("user")!;
  const groupId = c.req.param("groupId");
  if (!groupId) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const result = await cancelReservationGroup(db, groupId, user.id);

  if ("ok" in result) return c.json({ ok: true });
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
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const note = normalizeReturnNote(body.note);
  const result = await returnReservationByMember(db, id, user.id, note);

  if ("ok" in result) {
    // 관리자 알림 — 회원이 직접 반납했음을 알린다 (B-09 1단계)
    if (isTelegramConfigured(c.env)) {
      runInBackground(c, async () => {
        const [row] = (await db.query(
          `SELECT COALESCE(r.item_name_snapshot, items.name) AS item_name,
                  r.qty, r.return_note
             FROM reservations r
             JOIN items ON items.id = r.item_id
            WHERE r.id = ?1`,
          [id],
        )) as { item_name: string; qty: number; return_note: string | null }[];
        await notifyReservationReturned(c.env, {
          itemName: row?.item_name ?? `대여 #${id}`,
          qty: row?.qty ?? 1,
          memberName: user.name,
          affiliation: user.affiliation,
          note: row?.return_note ?? note,
          byMember: true,
        });
      });
    }
    return c.json({ ok: true });
  }
  if (result.error === "bad_status")
    return c.json({ error: "bad_status" }, 409);
  return c.json({ error: "not_found" }, 404);
});

// ===== 반납 상태 사진 =====
// 반납 확인 모달에서 올린다 — 본인 + 대여 중(rented)인 건만. 반납은 사진이 없어도
// 가능하며, 사진은 상태·재고 전이에 영향을 주지 않는다. 최대 장수·중복 업로드 가드는
// reservation-photos.service 가 맡는다.
reservationsRoute.post("/:id/photos", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const form = await c.req.formData();
  const file = form.get("file") as unknown;
  if (!(file instanceof File)) return c.json({ error: "file 필드 필요" }, 400);
  const checked = await validatePhotoFile(file);
  if (!checked.ok) return c.json({ error: checked.error }, checked.status);

  const db: Sql = getDb(c.env);
  const result = await addReturnPhoto(db, c.env, {
    reservationId: id,
    actor: { id: user.id, role: "member" },
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

// 반납 사진 삭제 — 반납 전(대여 중)에만. 반납 후에는 이력의 증빙이라 회원이 지우지 않는다.
reservationsRoute.delete("/:id/photos/:photoId", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const photoId = Number(c.req.param("photoId"));
  if (!Number.isInteger(id) || !Number.isInteger(photoId)) {
    return c.json({ error: "bad_id" }, 400);
  }

  const db: Sql = getDb(c.env);
  const ok = await deleteReturnPhoto(db, c.env, {
    reservationId: id,
    photoId,
    actor: { id: user.id, role: "member" },
  });
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
