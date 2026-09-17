import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import { imageSize } from "../../image-size";
import {
  listAdminItems,
  getAdminItem,
  createItem,
  updateItem,
  deleteItem,
  addPhoto,
  deletePhoto,
  MAX_PHOTOS,
} from "../../services/items.service";

// SPEC §7.4 — /api/admin/items (물품 CRUD + 사진 관리, admin 전용)
// 입력 검증은 여기, SQL·임베딩·R2 관리는 items.service 에 위임
export const adminItemsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
adminItemsRoute.use("*", requireAdmin);

const ITEM_STATUS = ["active", "repair", "retired"] as const;
const ITEM_KIND = ["rental", "consumable"] as const;

// 자유 텍스트 속성 — 시트에서 온 빈 칸이 ''로 들어오는 경우가 있어 NULL로 정규화한다
// (''와 NULL이 섞이면 위치·규격 검색이 갈라진다)
const TEXT_ATTRS = [
  "description",
  "location",
  "size",
  "color",
  "note",
] as const;

function normText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// 본문에 실제로 전달된 속성만 골라 검증한다 — 전달하지 않은 필드는 기존 값(등록 시엔
// 테이블 기본값)이 유지되므로 수정 화면에서 일부 필드만 보내도 나머지가 지워지지 않는다.
// 반환 키는 이 allow-list에서만 나오므로 동적 INSERT/SET 절에 사용해도 안전하다.
function readAttrs(
  body: Record<string, unknown>,
): { attrs: Record<string, unknown> } | { error: string } {
  const attrs: Record<string, unknown> = {};
  for (const k of TEXT_ATTRS) if (k in body) attrs[k] = normText(body[k]);
  if ("kind" in body) {
    if (!ITEM_KIND.includes(body.kind as never)) {
      return { error: "kind는 'rental'(대여품) 또는 'consumable'(소모품)" };
    }
    attrs.kind = body.kind;
  }
  if ("qty_broken" in body) {
    const n = Number(body.qty_broken);
    if (!Number.isInteger(n) || n < 0) {
      return { error: "qty_broken은 0 이상 정수" };
    }
    attrs.qty_broken = n;
  }
  return { attrs };
}
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// 바이트(비용)와 픽셀(브라우저 부하)은 막는 대상이 다르다 — 둘 다 검사한다(§4.2).
// 클라이언트가 1600px·q80 WebP로 줄여 보내므로 정상 업로드는 150KB 안쪽이다.
// 2MB는 그 경로를 거치지 않은 업로드를 거르는 상한이고, MAX_PHOTO_EDGE는
// 용량이 작아도 픽셀이 큰 경우(예: 4000×3000 JPEG q25 ≈ 700KB)를 잡는다.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_EDGE = 1600;

// 목록 — 폐기 포함 전체 (관리자)
adminItemsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const items = await listAdminItems(db);
  return c.json({ items });
});

// 편집용 단건 — 공개 상세(§7.4)와 달리 note(내부 메모)까지 내려준다.
// 편집 폼이 공개 상세를 씨드로 쓰면 note가 undefined → ''로 저장되어 메모가 날아간다.
adminItemsRoute.get("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const item = await getAdminItem(db, id);
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json({ item });
});

// 등록 — 카테고리 없음(0011 제거). 물품 탐색은 검색이 담당한다.
adminItemsRoute.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "name 필수" }, 400);
  const total_qty = Number(body.total_qty ?? 1);
  const max_days = Number(body.max_days ?? 7);
  const status = ITEM_STATUS.includes(body.status as never)
    ? (body.status as string)
    : "active";
  if (!Number.isInteger(total_qty) || total_qty < 1) {
    return c.json({ error: "total_qty는 1 이상" }, 400);
  }
  if (!Number.isInteger(max_days) || max_days < 1 || max_days > 365) {
    return c.json({ error: "max_days는 1~365" }, 400);
  }

  const parsed = readAttrs(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const attrs = parsed.attrs;
  const broken = (attrs.qty_broken as number | undefined) ?? 0;
  if (broken > total_qty) {
    return c.json({ error: "qty_broken은 total_qty 이하" }, 400);
  }

  const db: Sql = getDb(c.env);
  const id = await createItem(db, c.env, {
    name,
    status,
    total_qty,
    max_days,
    attrs,
  });
  return c.json({ id }, 201);
});

// 수정 — 전달된 필드만 갱신
adminItemsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();

  // 속성 필드(description/location/size/color/note/kind/qty_broken)를 먼저 수집
  const parsed = readAttrs(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const fields: Record<string, unknown> = { ...parsed.attrs };
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name 빈 값 불가" }, 400);
    fields.name = name;
  }
  if ("total_qty" in body) {
    const total_qty = Number(body.total_qty);
    if (!Number.isInteger(total_qty) || total_qty < 1) {
      return c.json({ error: "total_qty는 1 이상" }, 400);
    }
    fields.total_qty = total_qty;
  }
  if ("max_days" in body) {
    const max_days = Number(body.max_days);
    if (!Number.isInteger(max_days) || max_days < 1 || max_days > 365) {
      return c.json({ error: "max_days는 1~365" }, 400);
    }
    fields.max_days = max_days;
  }
  if ("status" in body) {
    if (!ITEM_STATUS.includes(body.status as never)) {
      return c.json({ error: "status 오류" }, 400);
    }
    fields.status = body.status;
  }
  if (Object.keys(fields).length === 0) {
    return c.json({ error: "변경할 필드 없음" }, 400);
  }

  const db: Sql = getDb(c.env);
  // qty_constraint(수량 조합이 qty_broken ≤ total_qty 위반)·not_found 구분은 서비스가 한다
  const result = await updateItem(db, c.env, id, fields);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  return c.json({ error: "qty_broken은 total_qty 이하" }, 400);
});

// 삭제 — 대여 이력이 있으면 거부 (폐기 상태로 전환 권장)
adminItemsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db: Sql = getDb(c.env);
  const result = await deleteItem(db, c.env, id);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "has_history") {
    return c.json(
      { error: "대여 이력이 있어 삭제 불가 — 상태를 폐기로 변경하세요" },
      409,
    );
  }
  return c.json({ error: "not_found" }, 404);
});

// 사진 업로드 — multipart/form-data "file" 필드 → R2 직접 저장 (§4.2)
adminItemsRoute.post("/:id/photos", async (c) => {
  const itemId = Number(c.req.param("id"));
  const form = await c.req.formData();
  const file = form.get("file") as unknown;
  if (!(file instanceof File)) return c.json({ error: "file 필드 필요" }, 400);
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return c.json({ error: "지원 형식: JPEG/PNG/WebP" }, 400);
  if (file.size > MAX_PHOTO_BYTES) {
    return c.json(
      { error: `사진은 최대 ${MAX_PHOTO_BYTES / 1024 / 1024}MB` },
      400,
    );
  }
  // 픽셀 검사 — 용량만 보면 재압축한 큰 이미지가 통과한다(§4.2)
  const dim = imageSize(new Uint8Array(await file.arrayBuffer()));
  if (!dim) return c.json({ error: "이미지 크기를 읽을 수 없습니다" }, 400);
  if (dim.width > MAX_PHOTO_EDGE || dim.height > MAX_PHOTO_EDGE) {
    return c.json(
      {
        error:
          `사진은 가로·세로 ${MAX_PHOTO_EDGE}px 이하여야 합니다 ` +
          `(현재 ${dim.width}×${dim.height})`,
      },
      400,
    );
  }

  const db: Sql = getDb(c.env);
  const result = await addPhoto(db, c.env, itemId, file, ext);
  if ("ok" in result) return c.json({ id: result.id, url: result.url }, 201);
  if (result.error === "too_many") {
    return c.json({ error: `사진은 최대 ${MAX_PHOTOS}장` }, 409);
  }
  return c.json({ error: "not_found" }, 404);
});

// 사진 삭제 — R2 오브젝트 + 행 함께 제거
adminItemsRoute.delete("/:id/photos/:photoId", async (c) => {
  const itemId = Number(c.req.param("id"));
  const photoId = Number(c.req.param("photoId"));
  const db: Sql = getDb(c.env);
  const ok = await deletePhoto(db, c.env, itemId, photoId);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
