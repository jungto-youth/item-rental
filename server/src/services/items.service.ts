// 물품(Item) 도메인 서비스 — 목록/상세/가용성/CRUD/사진의 SQL 을 직접 소유
// 검색 외 물품 조회·관리에 필요한 모든 쿼리
import type { Sql } from "../db";
import type { Bindings } from "../types";
import type { Item } from "../../../shared/api-types";
import { embedItem, uncacheVec } from "../embedding";

// D1 의 json_group_array 는 TEXT 를 돌려준다 — Postgres 드라이버는 json 타입을 파싱해 줬으므로
// 그 자리를 이 헬퍼가 대신한다 (문자열이 아니면 이미 파싱된 값으로 간주)
export function parseJsonCol<T>(v: unknown): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : ((v ?? []) as T);
}

// D1 에선 BLOB(ArrayBuffer)이 c.json 에서 {} 로 직렬화된다 — 응답에 임베딩을 싣지 않게
// items.* 대신 컬럼을 명시한다 (web 은 embedding 필드를 읽지 않는다)
const ADMIN_ITEM_COLUMNS = `items.id, items.name, items.description, items.status, items.total_qty,
            items.qty_broken, items.kind, items.location, items.created_at`;

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

// 컴파일 타임 가드 — SQL 행이 클라이언트 뷰(shared Item)를 만족하는지 검사한다.
// 어느 쪽이 어긋나면 이 타입이 never 가 되어 tsc 가 에러를 낸다.
type _ListItemRowIsItem = ListItemRow extends Item ? true : never;

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

// ===== 공개 조회 () =====

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
      (SELECT json_group_array(json_object('id', p.id, 'url', '/api/photos/' || p.r2_key))
       FROM (SELECT p.id, p.r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order) p) AS photos,
      (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
        WHERE r.item_id = items.id AND r.status = 'rented') AS active_now,
      (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
       FROM (SELECT c.id, c.name FROM item_categories ic
              JOIN categories c ON c.id = ic.category_id
              WHERE ic.item_id = items.id ORDER BY c.name) c) AS categories
     FROM items
    WHERE items.id = ?1`,
    [itemId],
  )) as ListItemRow[];

  if (rows.length === 0) return null;
  const row = rows[0];
  row.photos = parseJsonCol(row.photos);
  row.categories = parseJsonCol(row.categories);
  return row;
}

// ===== 관리자 CRUD () =====

// 목록 — 폐기 포함 전체 (관리자)
export async function listAdminItems(db: Sql) {
  const rows = (await db.query(
    `SELECT ${ADMIN_ITEM_COLUMNS},
            (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
             FROM (SELECT c.id, c.name FROM item_categories ic
                    JOIN categories c ON c.id = ic.category_id
                    WHERE ic.item_id = items.id ORDER BY c.name) c) AS categories,
            (SELECT p.r2_key FROM item_photos p WHERE p.item_id = items.id
              ORDER BY p.sort_order LIMIT 1) AS thumb_key,
            (SELECT COUNT(*) FROM item_photos p WHERE p.item_id = items.id) AS photo_count,
            (SELECT COUNT(*) FROM reservations r WHERE r.item_id = items.id) AS reservation_count
     FROM items
     ORDER BY items.id DESC`,
  )) as (AdminItemRow & { categories: unknown })[];
  return rows.map((r) => ({ ...r, categories: parseJsonCol(r.categories) }));
}

// 편집용 단건 — 공개 상세()와 달리 태그까지 내려준다 (SELECT + 태그 조인 — 관리자 화면용)
export async function getAdminItem(
  db: Sql,
  itemId: number,
): Promise<AdminItemRow | null> {
  const rows = (await db.query(
    `SELECT ${ADMIN_ITEM_COLUMNS},
            (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
             FROM (SELECT c.id, c.name FROM item_categories ic
                    JOIN categories c ON c.id = ic.category_id
                    WHERE ic.item_id = items.id ORDER BY c.name) c) AS categories
     FROM items WHERE items.id = ?1`,
    [itemId],
  )) as (AdminItemRow & { categories: unknown })[];
  if (rows.length === 0) return null;
  return { ...rows[0], categories: parseJsonCol(rows[0].categories) };
}

// 등록 — 입력 검증은 라우트, SQL·임베딩은 서비스
// attrs.category_ids (배열, 0개 허용)는 items 컬럼이 아니라 조인 테이블에 넣는다.
// 물품 + 태그 + FTS 행을 batch 한 장으로 — 중간 실패로 태그 없는 물품이나 FTS 미갱신 같은
// 부분 상태가 남지 않는다. 이후 문장들은 새 물품 id 를 (SELECT MAX(id) FROM items) 로 참조한다 —
// batch 는 하나의 트랜잭션이라 도중에 다른 쓰기가 끼어들 수 없고 INSERT 직후라 MAX(id) 는
// 방금 넣은 행이다. last_insert_rowid() 는 문장 사이에 값이 바뀌므로(태그 INSERT 도 새 rowid 를
// 만든다) 쓰지 않는다. 카테고리 FK 위반이면 batch 전체가 롤백된다 — 물품만 남는 일이 없다.
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
  const results = await db.batch<{ id: number }>([
    {
      sql: `INSERT INTO items (${cols.join(", ")})
            VALUES (${cols.map((_, i) => `?${i + 1}`).join(", ")}) RETURNING id`,
      params: vals,
    },
    {
      sql: `INSERT INTO item_categories (item_id, category_id)
            SELECT (SELECT MAX(id) FROM items), j.value FROM json_each(?1) j`,
      params: [JSON.stringify(categoryIds)],
    },
    {
      sql: `INSERT INTO items_fts (rowid, name, description, location, tags)
            SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(i.location, ''),
                   COALESCE((SELECT group_concat(c.name, ' ')
                      FROM (SELECT c.name FROM item_categories ic
                             JOIN categories c ON c.id = ic.category_id
                            WHERE ic.item_id = i.id ORDER BY c.name) c), '')
              FROM items i WHERE i.id = (SELECT MAX(id) FROM items)`,
    },
  ]);
  const id = results[0][0].id;
  // 등록 즉시 의미 검색용 임베딩 생성 (실패해도 등록은 성공 — 키워드 검색은 계속 동작)
  await embedItem(env, db, id);
  return id;
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
  const keys = Object.keys(itemFields);

  // 수량 관련 필드가 바뀌면 결과 조합이 제약(qty_broken ≤ total_qty)을 지키는지 본다.
  // 한쪽만 보내는 경우가 흔하므로 현재 값을 읽어 합쳐서 판정한다 — 친절한 400 용 사전 검사이고,
  // 검사와 UPDATE 사이 값이 바뀌어도 DB CHECK 가 아래 batch 를 원자 거절한다.
  if ("qty_broken" in fields || "total_qty" in fields) {
    const [cur] = (await db.query(
      `SELECT total_qty, qty_broken FROM items WHERE id = ?1`,
      [itemId],
    )) as { total_qty: number; qty_broken: number }[];
    if (!cur) return { error: "not_found" };
    const nextTotal = (fields.total_qty as number | undefined) ?? cur.total_qty;
    const nextBroken =
      (fields.qty_broken as number | undefined) ?? cur.qty_broken;
    if (nextBroken > nextTotal) return { error: "qty_constraint" };
  }
  // 태그만 보낸 요청(keys 비움)은 UPDATE 문이 문법 오류가 되므로 컬럼 갱신을 건너뛴다 —
  // 이 경우 존재 여부는 조인 테이블 작업 전 가드 SELECT 로 확인한다.
  if (keys.length === 0 && categoryIds !== undefined) {
    const [row] = (await db.query(`SELECT id FROM items WHERE id = ?1`, [
      itemId,
    ])) as { id: number }[];
    if (!row) return { error: "not_found" };
  }

  // 컬럼 갱신 + 태그 교체 + FTS 동기화를 batch 한 장으로 원자 처리 — 도중 실패로
  // 태그만 바뀌고 FTS 가 옛 태그를 가리키는 부분 상태가 남지 않는다.
  if (keys.length > 0 || categoryIds !== undefined) {
    const stmts: { sql: string; params?: unknown[] }[] = [];
    if (keys.length > 0) {
      const setSql = keys.map((k, i) => `${k} = ?${i + 2}`).join(", ");
      stmts.push({
        sql: `UPDATE items SET ${setSql} WHERE id = ?1 RETURNING id`,
        params: [itemId, ...keys.map((k) => itemFields[k])],
      });
    }
    if (categoryIds !== undefined) {
      stmts.push({
        sql: `DELETE FROM item_categories WHERE item_id = ?1`,
        params: [itemId],
      });
      // 물품 존재 가드 — 없는 물품이면 INSERT 하지 않는다. 가드 없이는 FK 위반으로
      // batch 가 떨어져 not_found(404) 대신 500 이 된다
      stmts.push({
        sql: `INSERT INTO item_categories (item_id, category_id)
              SELECT ?1, j.value FROM json_each(?2) j
               WHERE EXISTS (SELECT 1 FROM items WHERE id = ?1)`,
        params: [itemId, JSON.stringify(categoryIds)],
      });
    }
    stmts.push({
      sql: `DELETE FROM items_fts WHERE rowid = ?1`,
      params: [itemId],
    });
    stmts.push({
      sql: `INSERT INTO items_fts (rowid, name, description, location, tags)
            SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(i.location, ''),
                   COALESCE((SELECT group_concat(c.name, ' ')
                      FROM (SELECT c.name FROM item_categories ic
                             JOIN categories c ON c.id = ic.category_id
                            WHERE ic.item_id = i.id ORDER BY c.name) c), '')
              FROM items i WHERE i.id = ?1`,
      params: [itemId],
    });
    try {
      const results = await db.batch<{ id: number }>(stmts);
      // 컬럼 갱신이 있었는데 0행이면 물품이 없다 — 태그·FTS 문은 없는 물품에 no-op 이라
      // batch 가 부분 변경을 남기지 않는다
      if (keys.length > 0 && results[0].length === 0) {
        return { error: "not_found" };
      }
    } catch (err) {
      // 사전 검사와 UPDATE 사이 수량이 바뀐 경우 — DB CHECK 가 최종 방어선
      if (err instanceof Error && /CHECK constraint failed/.test(err.message)) {
        return { error: "qty_constraint" };
      }
      throw err;
    }
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
    `SELECT COUNT(*) AS n FROM reservations WHERE item_id = ?1`,
    [itemId],
  )) as { n: number }[];
  if (cnt.n > 0) return { error: "has_history" };

  // 사진 R2 키를 먼저 읽는다 — 행은 FK CASCADE 로 함께 지워지지만 R2 오브젝트는 그대로 남아
  // 영구 고아가 되므로 키를 읽어 함께 삭제한다(v3.1). R2 삭제가 일부 실패하면 오브젝트가 남을
  // 수 있으나 키를 잃어 사후 정리조차 못 하는 것보다 낫다.
  const keys = (await db.query(
    `SELECT r2_key FROM item_photos WHERE item_id = ?1`,
    [itemId],
  )) as { r2_key: string }[];
  // 물품 + FTS 행을 한 트랜잭션으로 — FTS 에 고아가 남지 않는다 (PLAN §7.3)
  const results = await db.batch<{ id: number }>([
    { sql: `DELETE FROM items WHERE id = ?1 RETURNING id`, params: [itemId] },
    { sql: `DELETE FROM items_fts WHERE rowid = ?1`, params: [itemId] },
  ]);
  if (results[0].length === 0) return { error: "not_found" };
  uncacheVec(itemId);
  try {
    for (const key of keys) await env.PHOTOS.delete(key.r2_key);
  } catch (err) {
    console.error(`R2 사진 삭제 실패 (item ${itemId})`, err);
  }
  return { ok: true };
}

// ===== 사진 관리 () =====

export const MAX_PHOTOS = 3; //  사진 최대 3장

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
  const exists = (await db.query(`SELECT id FROM items WHERE id = ?1`, [
    itemId,
  ])) as { id: number }[];
  if (exists.length === 0) return { error: "not_found" };

  const key = `items/${itemId}/${crypto.randomUUID()}.${ext}`;
  // 사진 개수 상한을 INSERT 가드로 검사 — COUNT-then-INSERT 사이 동시 업로드로
  // MAX_PHOTOS 를 넘기지 않는다. sort_order 도 같은 문장에서 최댓값+1 로 정한다
  // (등록순 확정 — 대표 사진이 첫 사진이 되는 근거).
  const inserted = (await db.query(
    `INSERT INTO item_photos (item_id, r2_key, sort_order)
     SELECT ?1, ?2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM item_photos WHERE item_id = ?1)
      WHERE (SELECT COUNT(*) FROM item_photos WHERE item_id = ?1) < ${MAX_PHOTOS}
      RETURNING id`,
    [itemId, key],
  )) as { id: number }[];
  if (inserted.length === 0) return { error: "too_many" };
  const photoId = inserted[0].id;

  // R2 업로드가 실패하면 슬롯을 환수한다 — 오브젝트 없는 행(깨진 이미지)을 남기지 않게
  try {
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    await db.query(`DELETE FROM item_photos WHERE id = ?1`, [photoId]);
    throw err;
  }
  return { ok: true, id: photoId, url: `/api/photos/${key}` };
}

// 사진 삭제 — 행 먼저 지우고 R2 오브젝트를 지운다. R2 삭제가 실패해도 남는 건
// 회수 가능한 고아 오브젝트뿐이다 (행이 남아 깨진 이미지를 보여주는 것보다 낫다 —
// deleteItem 과 같은 기준). false 면 없음(404)
export async function deletePhoto(
  db: Sql,
  env: Bindings,
  itemId: number,
  photoId: number,
): Promise<boolean> {
  const rows = (await db.query(
    `DELETE FROM item_photos WHERE id = ?1 AND item_id = ?2 RETURNING r2_key`,
    [photoId, itemId],
  )) as { r2_key: string }[];
  if (rows.length === 0) return false;
  try {
    await env.PHOTOS.delete(rows[0].r2_key);
  } catch (err) {
    console.error(`R2 사진 삭제 실패 (photo ${photoId})`, err);
  }
  return true;
}
