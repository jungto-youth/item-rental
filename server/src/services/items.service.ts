// 물품(Item) 도메인 서비스 — 목록/상세/가용성/CRUD/사진의 SQL 을 직접 소유
// SPEC §4.2·§7.4·§7.6 — 검색 외 물품 조회·관리에 필요한 모든 쿼리
import type { Sql } from "../db";
import type { Bindings } from "../types";
import { embedItem } from "../embedding";

// ===== 행 타입 =====

export type ItemAttrs = {
  kind: "rental" | "consumable";
  location: string | null;
  qty_broken: number;
};

export type ListItemRow = ItemAttrs & {
  id: number;
  name: string;
  description: string | null;
  total_qty: number;
  rentable_qty: number;
  status: "active" | "repair" | "retired";
  photos: { id: number; url: string }[];
  active_now: number;
  categories: { id: number; name: string }[];
};

// 관리자용 Item 행
// categories·thumb_key 는 목록/단건 SQL (=0021 태그 조인)이 채운다.
export type AdminItemRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  total_qty: number;
  qty_broken: number;
  kind: string;
  location: string | null;
  categories: { id: number; name: string }[];
  thumb_key: string | null;
};

// ===== 공개 조회 (§7.4·§7.6) =====

// 상세 페이지 — 설명·수량 + 현재 대여 중 수량(active_now)
export async function getItemDetail(
  db: Sql,
  itemId: number,
): Promise<ListItemRow | null> {
  const rows = (await db.query(
    `SELECT items.id, items.name, items.description, items.total_qty, items.status,
      items.kind, items.location,
      items.qty_broken,
      (items.total_qty - items.qty_broken) AS rentable_qty,
      (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                        ORDER BY p.sort_order), '[]'::json)
       FROM item_photos p WHERE p.item_id = items.id) AS photos,
      (SELECT COALESCE(SUM(r.qty), 0)::int FROM reservations r
        WHERE r.item_id = items.id AND r.status = 'rented') AS active_now,
      (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name), '[]'::json)
       FROM item_categories ic JOIN categories c ON c.id = ic.category_id
       WHERE ic.item_id = items.id) AS categories
     FROM items
    WHERE items.id = $1`,
    [itemId],
  )) as ListItemRow[];

  return rows.length === 0 ? null : rows[0];
}

// ===== 관리자 CRUD (§7.4) =====

// 목록 — 폐기 포함 전체 (관리자)
export async function listAdminItems(db: Sql) {
  return db.query(
    `SELECT items.*,
            (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)
                              ORDER BY c.name), '[]'::json)
             FROM item_categories ic JOIN categories c ON c.id = ic.category_id
             WHERE ic.item_id = items.id) AS categories,
            (SELECT p.r2_key FROM item_photos p WHERE p.item_id = items.id
              ORDER BY p.sort_order LIMIT 1) AS thumb_key,
            (SELECT COUNT(*)::int FROM item_photos p WHERE p.item_id = items.id) AS photo_count,
            (SELECT COUNT(*)::int FROM reservations r WHERE r.item_id = items.id) AS reservation_count
     FROM items
     ORDER BY items.id DESC`,
  );
}

// 편집용 단건 — 공개 상세(§7.4)와 달리 태그까지 내려준다 (SELECT * + 태그 조인 — 관리자 화면용)
export async function getAdminItem(
  db: Sql,
  itemId: number,
): Promise<AdminItemRow | null> {
  const rows = (await db.query(
    `SELECT items.*,
            (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)
                              ORDER BY c.name), '[]'::json)
             FROM item_categories ic JOIN categories c ON c.id = ic.category_id
             WHERE ic.item_id = items.id) AS categories
     FROM items WHERE items.id = $1`,
    [itemId],
  )) as AdminItemRow[];
  return rows.length === 0 ? null : rows[0];
}

// 등록 — 입력 검증은 라우트, SQL·임베딩은 서비스
// attrs.category_ids (배열, 0개 허용)는 items 컬럼이 아니라 조인 테이블에 넣는다.
export async function createItem(
  db: Sql,
  env: Bindings,
  input: {
    name: string;
    status: string;
    total_qty: number;
    attrs: Record<string, unknown>;
  },
): Promise<number> {
  const { category_ids, ...itemAttrs } = input.attrs;
  const categoryIds = (category_ids as number[] | undefined) ?? [];
  const cols = ["name", "status", "total_qty", ...Object.keys(itemAttrs)];
  const vals = [
    input.name,
    input.status,
    input.total_qty,
    ...Object.values(itemAttrs),
  ];
  const [row] = (await db.query(
    `INSERT INTO items (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    vals,
  )) as { id: number }[];
  await replaceItemCategories(db, row.id, categoryIds);
  // 등록 즉시 의미 검색용 임베딩 생성 (실패해도 등록은 성공 — 키워드 검색은 계속 동작)
  await embedItem(env, db, row.id);
  return row.id;
}

// 태그 전체 교체 — 배열이 비면 연결만 제거된다 (만든 중복 id 는 라우트가 이미 제거)
async function replaceItemCategories(db: Sql, itemId: number, categoryIds: number[]) {
  await db.query(`DELETE FROM item_categories WHERE item_id = $1`, [itemId]);
  for (const cid of categoryIds) {
    await db.query(
      `INSERT INTO item_categories (item_id, category_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [itemId, cid],
    );
  }
}

// 수정 결과 — qty_constraint: 수량 조합이 제약(qty_broken ≤ total_qty) 위반 (라우트가 400 응답)
export type UpdateItemResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "qty_constraint" };

export async function updateItem(
  db: Sql,
  env: Bindings,
  itemId: number,
  fields: Record<string, unknown>,
): Promise<UpdateItemResult> {
  // 태그는 items 컬럼이 아니므로 SET 절에서 빼 조인 테이블을 교체한다 (매개변수는 교체 의미론)
  const categoryIds = fields.category_ids as number[] | undefined;
  const { category_ids: _tags, ...itemFields } = fields;
  // 수량 관련 필드가 바뀌면 결과 조합이 제약(qty_broken ≤ total_qty)을 지키는지 본다.
  // 한쪽만 보내는 경우가 흔하므로 현재 값을 읽어 합쳐서 판정한다.
  if ("qty_broken" in fields || "total_qty" in fields) {
    const [cur] = (await db.query(
      `SELECT total_qty, qty_broken FROM items WHERE id = $1`,
      [itemId],
    )) as { total_qty: number; qty_broken: number }[];
    if (!cur) return { error: "not_found" };
    const nextTotal = (fields.total_qty as number | undefined) ?? cur.total_qty;
    const nextBroken =
      (fields.qty_broken as number | undefined) ?? cur.qty_broken;
    if (nextBroken > nextTotal) return { error: "qty_constraint" };
  }
  const keys = Object.keys(itemFields);
  const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const rows = (await db.query(
    `UPDATE items SET ${setSql} WHERE id = $1 RETURNING id`,
    [itemId, ...keys.map((k) => itemFields[k])],
  )) as { id: number }[];
  if (rows.length === 0) return { error: "not_found" };
      if (categoryIds !== undefined) {
        await replaceItemCategories(db, itemId, categoryIds);
      }
  // 이름·설명·태그가 바뀌면 임베딩도 갱신 (무조건 재생성 — 소규모라 비용 무시)
  await embedItem(env, db, itemId);
  return { ok: true };
}

// 삭제 결과 — has_history: 대여 이력 있어 거부 (라우트가 409 응답, 폐기 상태 전환 권장)
export type DeleteItemResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "has_history" };

export async function deleteItem(
  db: Sql,
  env: Bindings,
  itemId: number,
): Promise<DeleteItemResult> {
  // 대여 이력 확인
  const [cnt] = (await db.query(
    `SELECT COUNT(*)::int AS n FROM reservations WHERE item_id = $1`,
    [itemId],
  )) as { n: number }[];
  if (cnt.n > 0) return { error: "has_history" };

  // 사진 R2 키를 먼저 읽는다 — 행은 FK CASCADE 로 함께 지워지지만 R2 오브젝트는 그대로 남아
  // 영구 고아가 되므로 키를 읽어 함께 삭제한다(v3.1). R2 삭제가 일부 실패하면 오브젝트가 남을
  // 수 있으나 키를 잃어 사후 정리조차 못 하는 것보다 낫다.
  const keys = (await db.query(
    `SELECT r2_key FROM item_photos WHERE item_id = $1`,
    [itemId],
  )) as { r2_key: string }[];
  const rows = (await db.query(`DELETE FROM items WHERE id = $1 RETURNING id`, [
    itemId,
  ])) as { id: number }[];
  if (rows.length === 0) return { error: "not_found" };
  try {
    for (const key of keys) await env.PHOTOS.delete(key.r2_key);
  } catch (err) {
    console.error(`R2 사진 삭제 실패 (item ${itemId})`, err);
  }
  return { ok: true };
}

// ===== 사진 관리 (§4.2) =====

export const MAX_PHOTOS = 3; // §4.2 사진 최대 3장

// 사진 추가 결과 — too_many: 최대 장수 초과 (라우트가 409 응답)
export type AddPhotoResult =
  | { ok: true; id: number; url: string }
  | { error: "not_found" }
  | { error: "too_many" };

export async function addPhoto(
  db: Sql,
  env: Bindings,
  itemId: number,
  file: File,
  ext: string,
): Promise<AddPhotoResult> {
  // 물품 존재 확인
  const exists = (await db.query(`SELECT id FROM items WHERE id = $1`, [
    itemId,
  ])) as { id: number }[];
  if (exists.length === 0) return { error: "not_found" };

  // 사진 개수 확인
  const [cnt] = (await db.query(
    `SELECT COUNT(*)::int AS n FROM item_photos WHERE item_id = $1`,
    [itemId],
  )) as { n: number }[];
  if (cnt.n >= MAX_PHOTOS) return { error: "too_many" };

  const key = `items/${itemId}/${crypto.randomUUID()}.${ext}`;
  await env.PHOTOS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  // 등록순 확정 — 기존 최대 sort_order + 1 을 할당한다. 대표 사진(목록 photos[0]·상세 대표)이
  // 첫 사진으로 결정되는 근거가 된다. 전부 0 이면 ORDER BY p.sort_order 가 동점이라 순서·대표가
  // 임의로 바뀌었다 (§4.2, v3.1).
  const [mx] = (await db.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_photos WHERE item_id = $1`,
    [itemId],
  )) as { m: number }[];
  const [row] = (await db.query(
    `INSERT INTO item_photos (item_id, r2_key, sort_order) VALUES ($1, $2, $3) RETURNING id`,
    [itemId, key, mx.m + 1],
  )) as { id: number }[];
  return { ok: true, id: row.id, url: `/api/photos/${key}` };
}

// 사진 삭제 — R2 오브젝트 + 행 함께 제거. false 면 없음(404)
export async function deletePhoto(
  db: Sql,
  env: Bindings,
  itemId: number,
  photoId: number,
): Promise<boolean> {
  const rows = (await db.query(
    `SELECT id, r2_key FROM item_photos WHERE id = $1 AND item_id = $2`,
    [photoId, itemId],
  )) as { id: number; r2_key: string }[];
  if (rows.length === 0) return false;
  await env.PHOTOS.delete(rows[0].r2_key);
  await db.query(`DELETE FROM item_photos WHERE id = $1`, [photoId]);
  return true;
}
