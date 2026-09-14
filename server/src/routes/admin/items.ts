import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireManager } from "../../middleware/auth";
import { embedItem } from "../../embedding";
import { imageSize } from "../../image-size";

// SPEC §7.4 — /api/admin/items (물품 CRUD + 사진 관리, admin 전용)
export const adminItemsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
adminItemsRoute.use("*", requireManager);

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
const MAX_PHOTOS = 3; // §4.2 사진 최대 3장
// 바이트(비용)와 픽셀(브라우저 부하)은 막는 대상이 다르다 — 둘 다 검사한다(§4.2).
// 클라이언트가 1600px·q80 WebP로 줄여 보내므로 정상 업로드는 150KB 안쪽이다.
// 2MB는 그 경로를 거치지 않은 업로드를 거르는 상한이고, MAX_PHOTO_EDGE는
// 용량이 작아도 픽셀이 큰 경우(예: 4000×3000 JPEG q25 ≈ 700KB)를 잡는다.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_EDGE = 1600;

type ItemRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  total_qty: number;
  qty_broken: number;
  max_days: number;
  kind: string;
  location: string | null;
  size: string | null;
  color: string | null;
  note: string | null;
};

// 목록 — 폐기 포함 전체 (관리자)
adminItemsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const items = await db.query(
    `SELECT items.*,
            (SELECT COUNT(*)::int FROM item_photos p WHERE p.item_id = items.id) AS photo_count,
            (SELECT COUNT(*)::int FROM reservations r WHERE r.item_id = items.id) AS reservation_count
     FROM items
     ORDER BY items.id DESC`,
  );
  return c.json({ items });
});

// 편집용 단건 — 공개 상세(§7.4)와 달리 note(내부 메모)까지 내려준다.
// 편집 폼이 공개 상세를 씨드로 쓰면 note가 undefined → ''로 저장되어 메모가 날아간다.
adminItemsRoute.get("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const rows = (await db.query("SELECT * FROM items WHERE id = $1", [
    id,
  ])) as ItemRow[];
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ item: rows[0] });
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

  const cols = [
    "name",
    "status",
    "total_qty",
    "max_days",
    ...Object.keys(attrs),
  ];
  const vals = [name, status, total_qty, max_days, ...Object.values(attrs)];
  const db: Sql = getDb(c.env);
  const [row] = (await db.query(
    `INSERT INTO items (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    vals,
  )) as { id: number }[];
  // 등록 즉시 의미 검색용 임베딩 생성 (실패해도 등록은 성공 — 키워드 검색은 계속 동작)
  await embedItem(c.env, db, row.id);
  return c.json({ id: row.id }, 201);
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

  // 수량 관련 필드가 바뀌면 결과 조합이 제약(qty_broken ≤ total_qty)을 지키는지 본다.
  // 한쪽만 보내는 경우가 흔하므로 현재 값을 읽어 합쳐서 판정한다.
  if ("qty_broken" in fields || "total_qty" in fields) {
    const [cur] = (await db.query(
      "SELECT total_qty, qty_broken FROM items WHERE id = $1",
      [id],
    )) as { total_qty: number; qty_broken: number }[];
    if (!cur) return c.json({ error: "not_found" }, 404);
    const nextTotal = (fields.total_qty as number | undefined) ?? cur.total_qty;
    const nextBroken =
      (fields.qty_broken as number | undefined) ?? cur.qty_broken;
    if (nextBroken > nextTotal) {
      return c.json({ error: "qty_broken은 total_qty 이하" }, 400);
    }
  }

  const keys = Object.keys(fields);
  const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const rows = (await db.query(
    `UPDATE items SET ${setSql} WHERE id = $1 RETURNING id`,
    [id, ...keys.map((k) => fields[k])],
  )) as { id: number }[];
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  // 이름·설명이 바뀌면 임베딩도 갱신 (무조건 재생성 — 소규모라 비용 무시)
  await embedItem(c.env, db, id);
  return c.json({ ok: true });
});

// 삭제 — 대여 이력이 있으면 거부 (폐기 상태로 전환 권장)
adminItemsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db: Sql = getDb(c.env);
  const [cnt] = (await db.query(
    "SELECT COUNT(*)::int AS n FROM reservations WHERE item_id = $1",
    [id],
  )) as { n: number }[];
  if (cnt.n > 0) {
    return c.json(
      { error: "대여 이력이 있어 삭제 불가 — 상태를 폐기로 변경하세요" },
      409,
    );
  }
  // 사진 R2 키를 먼저 읽는다 — 행은 FK CASCADE 로 함께 지워지지만 R2 오브젝트는 그대로 남아
  // 영구 고아가 되므로 키를 읽어 함께 삭제한다(v3.1). R2 삭제가 일부 실패하면 오브젝트가 남을
  // 수 있으나 키를 잃어 사후 정리조차 못 하는 것보다 낫다.
  const keys = (
    (await db.query("SELECT r2_key FROM item_photos WHERE item_id = $1", [id])) as { r2_key: string }[]
  ).map((r) => r.r2_key);
  const rows = (await db.query("DELETE FROM items WHERE id = $1 RETURNING id", [
    id,
  ])) as { id: number }[];
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  try {
    for (const key of keys) await c.env.PHOTOS.delete(key);
  } catch (err) {
    console.error(`R2 사진 삭제 실패 (item ${id})`, err);
  }
  return c.json({ ok: true });
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
  const exists = (await db.query("SELECT id FROM items WHERE id = $1", [
    itemId,
  ])) as { id: number }[];
  if (exists.length === 0) return c.json({ error: "not_found" }, 404);
  const [cnt] = (await db.query(
    "SELECT COUNT(*)::int AS n FROM item_photos WHERE item_id = $1",
    [itemId],
  )) as { n: number }[];
  if (cnt.n >= MAX_PHOTOS) {
    return c.json({ error: `사진은 최대 ${MAX_PHOTOS}장` }, 409);
  }

  const key = `items/${itemId}/${crypto.randomUUID()}.${ext}`;
  await c.env.PHOTOS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  // 등록순 확정 — 기존 최대 sort_order + 1 을 할당한다. 대표 사진(목록 photos[0]·상세 대표)이
  // 첫 사진으로 결정되는 근거가 된다. 전부 0 이면 ORDER BY p.sort_order 가 동점이라 순서·대표가
  // 임의로 바뀌었다 (§4.2, v3.1).
  const [mx] = (await db.query(
    "SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_photos WHERE item_id = $1",
    [itemId],
  )) as { m: number }[];
  const [row] = (await db.query(
    "INSERT INTO item_photos (item_id, r2_key, sort_order) VALUES ($1, $2, $3) RETURNING id",
    [itemId, key, mx.m + 1],
  )) as { id: number }[];
  return c.json({ id: row.id, url: `/api/photos/${key}` }, 201);
});

// 사진 삭제 — R2 오브젝트 + 행 함께 제거
adminItemsRoute.delete("/:id/photos/:photoId", async (c) => {
  const itemId = Number(c.req.param("id"));
  const photoId = Number(c.req.param("photoId"));
  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    "SELECT id, r2_key FROM item_photos WHERE id = $1 AND item_id = $2",
    [photoId, itemId],
  )) as { id: number; r2_key: string }[];
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  await c.env.PHOTOS.delete(rows[0].r2_key);
  await db.query("DELETE FROM item_photos WHERE id = $1", [photoId]);
  return c.json({ ok: true });
});
