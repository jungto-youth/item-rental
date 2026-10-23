import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import { imageInfo } from "../../image-size";
import { MAX_PHOTO_UPLOAD_BYTES as MAX_PHOTO_BYTES, MAX_PHOTO_EDGE } from "../../../../shared/photo-limits";
import {
  getAdminItem,
  createItem,
  updateItem,
  deleteItem,
  addPhoto,
  deletePhoto,
  MAX_PHOTOS,
} from "../../services/items.service";
import { listItems } from "../../services/search.service";

// /api/admin/items (물품 CRUD + 사진 관리, admin 전용)
// 입력 검증은 여기, SQL·임베딩·R2 관리는 items.service 에 위임
export const adminItemsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
adminItemsRoute.use("*", requireAdmin);

const ITEM_LIFECYCLE = ["active", "retired"] as const;
const ITEM_KIND = ["rental", "consumable"] as const;

// 쿼리 파라미터 클램프 — LIMIT/OFFSET 을 SQL 에 그대로 넣기 전에 정수로 한정한다
function clampInt(
  raw: string | undefined,
  dflt: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

// 자유 텍스트 속성 — 시트에서 온 빈 칸이 ''로 들어오는 경우가 있어 NULL로 정규화한다
// (''와 NULL이 섞이면 위치 검색이 갈라진다). size/color/note 는 0016 마이그레이션에서 제거.
const TEXT_ATTRS = [
  "description",
  "location",
] as const;

// 자유 텍스트 상한 — name/description/location 에 비정상적으로 긴 값이 들어오는 걸 막는다
const MAX_TEXT_LEN = 2000;

function normText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT_LEN) : null;
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
  if ("qty_repair" in body) {
    const n = Number(body.qty_repair);
    if (!Number.isInteger(n) || n < 0) {
      return { error: "qty_repair는 0 이상 정수" };
    }
    attrs.qty_repair = n;
  }
  if ("category_ids" in body) {
    const v = body.category_ids;
    if (!Array.isArray(v)) {
      return { error: "category_ids는 배열이어야 합니다" };
    }
    const ids = [...new Set(v.map(Number))]; // 숫자화 + 중복 제거
    if (ids.some((n) => !Number.isInteger(n) || n < 1)) {
      return { error: "category_ids는 1 이상 정수 배열" };
    }
    attrs.category_ids = ids; // 빈 배열 = 태그 없음(미지정)
  }
  return { attrs };
}
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// 바이트(비용)와 픽셀(브라우저 부하)은 막는 대상이 다르다 — 둘 다 검사한다().
// 클라이언트가 1600px·q80 WebP로 줄여 보내므로 정상 업로드는 150KB 안쪽이다.
// 2MB는 그 경로를 거치지 않은 업로드를 거르는 상한이고, MAX_PHOTO_EDGE는
// 용량이 작아도 픽셀이 큰 경우(예: 4000×3000 JPEG q25 ≈ 700KB)를 잡는다.

// 목록 — 폐기 포함 전체 (물품 수정 선택 목록용). 행에 카테고리를 얹는다.
// category는 "none"(미지정) 또는 숫자 id 만 — 이외는 무시. limit/offset은
// 클램프되고 category도 정수 검증을 거치므로 보간이 안전하다(listItems 주석 참고)
adminItemsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const limit = clampInt(c.req.query("limit"), 500, 1, 1000);
  const offset = clampInt(c.req.query("offset"), 0, 0, 100_000);
  const categoryRaw = c.req.query("category") ?? "";
  const category =
    categoryRaw === "none" || /^\d+$/.test(categoryRaw) ? categoryRaw : null;
  const { items, total } = await listItems(db, {
    limit,
    offset,
    available: false,
    category,
    withCategories: true,
    includeRetired: true,
  });
  return c.json({ items, total, hasMore: offset + items.length < total });
});

// 편집용 단건 — 관리자 화면용으로 태그까지 내려준다. 편집 폼이 공개 상세를 씨드로
// 쓰면 카테고리가 undefined → [] 로 저장되어 태그가 날아간다.
adminItemsRoute.get("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const item = await getAdminItem(db, id);
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json({ item });
});

// 등록 — 새 카테고리명은 클라이언트가 /api/admin/categories 로 먼저 만들고 id 를 보낸다.
// (FK 위반은 500 이 아니라 명시 오류가 낫겠지만, 카테고리 생성+물품 등록이 같은 화면에서
//  순차로 일어나고 조회·생성 모두 같은 세션에 묶여 실제로 닿지 않는다 — 승인 경로만 거친다.)
adminItemsRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return c.json({ error: "name 필수" }, 400);
  const total_qty = Number(body.total_qty ?? 1);
  const lifecycle = ITEM_LIFECYCLE.includes(body.lifecycle as never)
    ? (body.lifecycle as string)
    : "active";
  if (!Number.isInteger(total_qty) || total_qty < 1 || total_qty > 100000) {
    return c.json({ error: "total_qty는 1 이상" }, 400);
  }

  const parsed = readAttrs(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const attrs = parsed.attrs;
  const repair = (attrs.qty_repair as number | undefined) ?? 0;
  if (repair > total_qty) {
    return c.json({ error: "수리중 수량은 보유 수량 이하" }, 400);
  }

  const db: Sql = getDb(c.env);
  const id = await createItem(db, c.env, {
    name,
    lifecycle,
    total_qty,
    attrs,
  });
  return c.json({ id }, 201);
});

// 수정 — 전달된 필드만 갱신
adminItemsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  // 속성 필드(description/location/size/color/note/kind/qty_broken)를 먼저 수집
  const parsed = readAttrs(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const fields: Record<string, unknown> = { ...parsed.attrs };
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!name) return c.json({ error: "name 빈 값 불가" }, 400);
    fields.name = name;
  }
  if ("total_qty" in body) {
    const total_qty = Number(body.total_qty);
    if (!Number.isInteger(total_qty) || total_qty < 1 || total_qty > 100000) {
      return c.json({ error: "total_qty는 1 이상" }, 400);
    }
    fields.total_qty = total_qty;
  }
  if ("lifecycle" in body) {
    if (!ITEM_LIFECYCLE.includes(body.lifecycle as never)) {
      return c.json({ error: "lifecycle은 'active' 또는 'retired'" }, 400);
    }
    fields.lifecycle = body.lifecycle;
  }
  if (Object.keys(fields).length === 0) {
    return c.json({ error: "변경할 필드 없음" }, 400);
  }

  const db: Sql = getDb(c.env);
  // qty_constraint(수리중 수량 > 보유 수량)·not_found 구분은 서비스가 한다
  const result = await updateItem(db, c.env, id, fields);
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "rented_qty_constraint") {
    return c.json({ error: "대여 중인 물품 수량보다 적게 줄일 수 없어요" }, 400);
  }
  return c.json({ error: "수리중 수량은 보유 수량 이하" }, 400);
});

// 삭제 — 대여 이력이 있으면 거부 (폐기 상태로 전환 권장)
adminItemsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
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

// 사진 업로드 — multipart/form-data "file" 필드 → R2 직접 저장
adminItemsRoute.post("/:id/photos", async (c) => {
  const itemId = Number(c.req.param("id"));
  if (!Number.isInteger(itemId)) return c.json({ error: "bad_id" }, 400);
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
  // 픽셀 검사 — 용량만 보면 재압축한 큰 이미지가 통과한다()
  const dim = imageInfo(new Uint8Array(await file.arrayBuffer()));
  if (!dim) return c.json({ error: "이미지 크기를 읽을 수 없습니다" }, 400);
  if (dim.type !== file.type) return c.json({ error: "이미지 형식과 파일 내용이 일치하지 않습니다" }, 400);
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
  if (!Number.isInteger(itemId) || !Number.isInteger(photoId))
    return c.json({ error: "bad_id" }, 400);
  const db: Sql = getDb(c.env);
  const ok = await deletePhoto(db, c.env, itemId, photoId);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
