// 물품(Item) 도메인 서비스 — 목록/상세/가용성/CRUD/사진의 SQL 을 직접 소유
// 검색 외 물품 조회·관리에 필요한 모든 쿼리
import { SQL_NOW, type Sql } from "../db";
import type { Bindings } from "../types";
import type { Item } from "../../../shared/api-types";
import { embedItem, uncacheVec } from "../embedding";
import { ftsDeleteSql, ftsInsertSql, ftsResyncByIds } from "./item-fts.service";
import { MAX_PHOTOS } from "../../../shared/photo-limits";

// D1 의 json_group_array 는 TEXT 를 돌려준다 — Postgres 드라이버는 json 타입을 파싱해 줬으므로
// 그 자리를 이 헬퍼가 대신한다 (문자열이 아니면 이미 파싱된 값으로 간주)
export function parseJsonCol<T>(v: unknown): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : ((v ?? []) as T);
}

// D1 에선 BLOB(ArrayBuffer)이 c.json 에서 {} 로 직렬화된다 — 응답에 임베딩을 싣지 않게
// items.* 대신 컬럼을 명시한다 (web 은 embedding 필드를 읽지 않는다).
// 위치는 locations 참조로 정규화됐지만(0005) API 계약은 계속 이름 문자열이라 join 으로 푼다.
const ADMIN_ITEM_COLUMNS = `items.id, items.name, items.description, items.lifecycle, items.total_qty,
            items.qty_repair, items.kind, l.name AS location, items.created_at`;

// ===== 행 타입 =====

type ItemAttrs = {
  kind: "rental" | "consumable";
  location: string | null;
  qty_repair: number;
};

export type ListItemRow = ItemAttrs & {
  id: number;
  name: string;
  description: string | null;
  total_qty: number;
  rentable_qty: number;
  lifecycle: "active" | "retired";
  photos: { id: number; url: string; thumb_url: string }[];
  // rented — 기존 이름 유지. pending/reserved 는 0012 이후 SQL 이 채운다.
  active_now: number;
  pending_qty?: number;
  reserved_qty?: number;
  // 관리자 목록·검색 응답에만 채운다 — 회원 응답에는 없다 (shared Item.categories? 참조)
  categories?: { id: number; name: string }[];
};

// 컴파일 타임 가드 — SQL 행이 클라이언트 뷰(shared Item)를 만족하는지 검사한다.
// (타입 별칭만 선언하면 never 여도 에러가 나지 않는다. 조건을 extends true 로 묶어야
//  어긋났을 때 tsc 가 실제로 실패한다)
type Assert<T extends true> = T;
type _ListItemRowIsItem = Assert<ListItemRow extends Item ? true : false>;

// 관리자용 Item 행 — categories 는 단건 SQL (=0021 태그 조인)이 채운다
export type AdminItemRow = {
  id: number;
  name: string;
  description: string | null;
  lifecycle: string;
  total_qty: number;
  qty_repair: number;
  kind: string;
  location: string | null;
  categories: { id: number; name: string }[];
};

// ===== 공개 조회 () =====

// 상세 페이지 — 설명·수량 + 현재 대여 중 수량(active_now)
export async function getItemDetail(
  db: Sql,
  itemId: number,
): Promise<ListItemRow | null> {
  const rows = (await db.query(
    `SELECT items.id, items.name, items.description, items.total_qty, items.lifecycle,
      items.kind, l.name AS location,
      items.qty_repair,
      (items.total_qty - items.qty_repair) AS rentable_qty,
      (SELECT json_group_array(json_object('id', p.id, 'url', '/api/photos/' || p.r2_key || '?access=members',
                                                    'thumb_url', '/api/photos/' || COALESCE(p.thumb_r2_key, p.r2_key) || '?access=members'))
       FROM (SELECT p.id, p.r2_key, p.thumb_r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order) p) AS photos,
      (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
        WHERE r.item_id = items.id AND r.status = 'rented') AS active_now,
      (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
        WHERE r.item_id = items.id AND r.status = 'pending') AS pending_qty,
      (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
        WHERE r.item_id = items.id AND r.status = 'reserved') AS reserved_qty,
      (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
       FROM (SELECT c.id, c.name FROM item_categories ic
              JOIN categories c ON c.id = ic.category_id
              WHERE ic.item_id = items.id ORDER BY c.name) c) AS categories
     FROM items
     LEFT JOIN locations l ON l.id = items.location_id
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
     FROM items
     LEFT JOIN locations l ON l.id = items.location_id
    WHERE items.id = ?1`,
    [itemId],
  )) as (AdminItemRow & { categories: unknown })[];
  if (rows.length === 0) return null;
  return { ...rows[0], categories: parseJsonCol(rows[0].categories) };
}

// 위치 이름 → locations.id. 없으면 만든다. 빈 값이면 null(위치 미지정).
// 0005 에서 items.location 텍스트가 locations 참조로 바뀌었지만 폼·API 계약은 이름 문자열
// 그대로다 — 이 함수가 그 경계를 맡는다. 두 문장 사이에 실패하면 쓰이지 않은 위치 행이
// 남을 수 있지만 물품은 저장되지 않고, 그 한 줄은 다음 등록에서 재사용된다.
async function resolveLocationId(
  db: Sql,
  name: string | null | undefined,
): Promise<number | null> {
  if (!name) return null;
  await db.query(
    `INSERT INTO locations (name) VALUES (?1) ON CONFLICT (name) DO NOTHING`,
    [name],
  );
  const [row] = (await db.query(
    `SELECT id FROM locations WHERE name = ?1`,
    [name],
  )) as { id: number }[];
  return row?.id ?? null;
}

// 등록 — 입력 검증은 라우트, SQL·임베딩은 서비스
// attrs.category_ids (배열, 0개 허용)는 items 컬럼이 아니라 조인 테이블에 넣는다.
// attrs.location (이름 문자열)은 locations 로 upsert 해 location_id 로 바꾼다.
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
    lifecycle: string;
    total_qty: number;
    attrs: Record<string, unknown>;
  },
): Promise<number> {
  const { category_ids, location, ...itemAttrs } = input.attrs;
  const hasLocation = "location" in input.attrs;
  const categoryIds = (category_ids as number[] | undefined) ?? [];
  const cols = ["name", "lifecycle", "total_qty", ...Object.keys(itemAttrs)];
  const vals = [
    input.name,
    input.lifecycle,
    input.total_qty,
    ...Object.values(itemAttrs),
  ];
  const placeholders = cols.map((_, i) => `?${i + 1}`);
  if (hasLocation) {
    cols.push("location_id");
    vals.push(await resolveLocationId(db, location as string | null));
    placeholders.push(`?${vals.length}`);
  }
  // updated_at 은 ADD COLUMN 이 strftime 기본값을 받지 않아 DEFAULT 가 없다(0005) —
  // 등록 시점에는 created_at 과 같은 값이 되도록 여기서 채운다.
  cols.push("updated_at");
  placeholders.push(SQL_NOW);

  const results = await db.batch<{ id: number }>([
    {
      sql: `INSERT INTO items (${cols.join(", ")})
            VALUES (${placeholders.join(", ")}) RETURNING id`,
      params: vals,
    },
    {
      sql: `INSERT INTO item_categories (item_id, category_id)
            SELECT (SELECT MAX(id) FROM items), j.value FROM json_each(?1) j`,
      params: [JSON.stringify(categoryIds)],
    },
    // 색인 문장은 item-fts.service 가 만든다 — 이 경로는 아직 id 를 모르므로 batch 안에서
    // MAX(id) 로 방금 넣은 행을 가리킨다 (id 를 아는 수정·카테고리 경로와 조건식만 다르다)
    { sql: ftsInsertSql(`i.id = (SELECT MAX(id) FROM items)`) },
  ]);
  const id = results[0][0].id;
  // 등록 즉시 의미 검색용 임베딩 생성 (실패해도 등록은 성공 — 키워드 검색은 계속 동작)
  await embedItem(env, db, id);
  return id;
}

// 수정 결과 — qty_constraint: 수량 조합이 제약(qty_repair ≤ total_qty) 위반 (라우트가 400 응답)
//                rented_qty_constraint: 대여 중인 수량 이하로 보유를 줄이려는 시도 (라우트가 400 응답)
type UpdateItemResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "qty_constraint" }
  | { error: "rented_qty_constraint" }
  | { error: "reserved_qty_constraint" }
  | { error: "has_open_reservations" };

export async function updateItem(
  db: Sql,
  env: Bindings,
  itemId: number,
  fields: Record<string, unknown>,
): Promise<UpdateItemResult> {
  // 태그는 items 컬럼이 아니므로 SET 절에서 빼 조인 테이블을 교체한다 (매개변수는 교체 의미론)
  const categoryIds = fields.category_ids as number[] | undefined;
  const { category_ids: _tags, location, ...rest } = fields;
  const itemFields: Record<string, unknown> = { ...rest };
  // 위치는 이름 문자열로 오고 컬럼은 location_id 다 — 있으면 사전을 upsert 해 id 로 바꾼다.
  // null/'' 는 위치 해제다.
  if ("location" in fields) {
    itemFields.location_id = await resolveLocationId(db, location as string | null);
  }
  const keys = Object.keys(itemFields);

  // 수량 관련 필드가 바뀌면 결과 조합이 제약(qty_repair ≤ total_qty)을 지키는지 본다.
  // 한쪽만 보내는 경우가 흔하므로 현재 값을 읽어 합쳐서 판정한다 — 친절한 400 용 사전 검사이고,
  // 검사와 UPDATE 사이 값이 바뀌어도 아래 UPDATE 가드의 조건부 갱신이 원자적으로 막는다.
  const qtyTouched = "qty_repair" in fields || "total_qty" in fields;
  let nextTotal = 0;
  let nextRepair = 0;
  if (qtyTouched) {
    const [cur] = (await db.query(
      `SELECT total_qty, qty_repair FROM items WHERE id = ?1`,
      [itemId],
    )) as { total_qty: number; qty_repair: number }[];
    if (!cur) return { error: "not_found" };
    nextTotal = (fields.total_qty as number | undefined) ?? cur.total_qty;
    nextRepair = (fields.qty_repair as number | undefined) ?? cur.qty_repair;
    if (nextRepair > nextTotal) return { error: "qty_constraint" };

    // 보유를 점유 수량보다 줄이면 재고가 음수가 된다. 대여 중·승인 대기는 실제 점유이고,
    // 예약 대기는 아직 점유가 아니지만 "신규 예약 <= 보유 수량" 불변식을 지키기 위해 함께 본다.
    // 수량을 안 건드리는 수정은 이 검사를 걸지 않는다 — 이미 잘못된 상태인 물품도
    // 이름·위치·사진 편집으로 갇히면 안 된다.
    const [active] = (await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'rented'  THEN qty ELSE 0 END), 0) AS rented_qty,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN qty ELSE 0 END), 0) AS pending_qty,
         COALESCE(SUM(CASE WHEN status = 'reserved' THEN qty ELSE 0 END), 0) AS reserved_qty
       FROM reservations
       WHERE item_id = ?1 AND status IN ('rented', 'pending', 'reserved')`,
      [itemId],
    )) as { rented_qty: number; pending_qty: number; reserved_qty: number }[];
    const nextRentable = nextTotal - nextRepair;
    if (nextRentable < active.rented_qty + active.pending_qty) {
      return { error: "rented_qty_constraint" };
    }
    if (nextRentable < active.reserved_qty) {
      return { error: "reserved_qty_constraint" };
    }
  }

  // 폐기·소모품 전환은 대기·대여 건이 없을 때만. 남아 있으면 승인할 수 없는 예약이 생긴다.
  const closesItem = fields.lifecycle === "retired" || fields.kind === "consumable";
  if (closesItem) {
    const [open] = (await db.query(
      `SELECT COALESCE(SUM(qty), 0) AS open_qty FROM reservations
        WHERE item_id = ?1 AND status IN ('rented', 'pending', 'reserved')`,
      [itemId],
    )) as { open_qty: number }[];
    if (open.open_qty > 0) return { error: "has_open_reservations" };
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
      // 수량 수정이면 UPDATE 안에 가드까지 넣는다. 위 사전 검사와 UPDATE 사이에 다른 관리자가
      // 마지막 수량을 빌려갈 수 있고, 이때 가드가 없으면 재고가 음수가 그대로 저장된다.
      // 조건부 UPDATE(0행면 거절)가 이 프로젝트의 원자 판정 방식이다(applyMemberRole 참조).
      const nextTotalParam = keys.length + 2;
      const nextRepairParam = keys.length + 3;
      const guardParts: string[] = [];
      if (qtyTouched) {
        guardParts.push(
          `?${nextTotalParam} - ?${nextRepairParam} >=
             (SELECT COALESCE(SUM(qty), 0) FROM reservations
               WHERE item_id = ?1 AND status IN ('rented', 'pending'))`,
          `?${nextTotalParam} - ?${nextRepairParam} >=
             (SELECT COALESCE(SUM(qty), 0) FROM reservations
               WHERE item_id = ?1 AND status = 'reserved')`,
        );
      }
      if (closesItem) {
        guardParts.push(
          `(SELECT COALESCE(SUM(qty), 0) FROM reservations
             WHERE item_id = ?1 AND status IN ('rented', 'pending', 'reserved')) = 0`,
        );
      }
      const guard = guardParts.length > 0 ? ` AND ${guardParts.join(" AND ")}` : "";
      const setSql = keys.map((k, i) => `${k} = ?${i + 2}`).join(", ");
      stmts.push({
        // updated_at 은 수정 경로에서만 갱신한다 — 등록 시엔 created_at 과 같은 값이다
        sql: `UPDATE items SET ${setSql}, updated_at = ${SQL_NOW} WHERE id = ?1${guard} RETURNING id`,
        // 가드 바인딩은 수량을 건드렸을 때만 붙인다 — 쓰지 않는 매개변수를 보내지 않는다
        params: qtyTouched
          ? [itemId, ...keys.map((k) => itemFields[k]), nextTotal, nextRepair]
          : [itemId, ...keys.map((k) => itemFields[k])],
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
    // 색인 행 재생성 (삭제 → 생성) — 태그가 바뀌었을 수 있어 항상 다시 만든다
    stmts.push(...ftsResyncByIds([itemId]));
    try {
      const results = await db.batch<{ id: number }>(stmts);
      // 컬럼 갱신이 있었는데 0행이면 물품이 없다 — 태그·FTS 문은 없는 물품에 no-op 이라
      // batch 가 부분 변경을 남기지 않는다
      if (keys.length > 0 && results[0].length === 0) {
        // UPDATE 가드는 물품 부재·점유 수량 초과·대기 건이 있는 폐기 전환을 함께 막는다.
        // 어느 쪽인지 한 번 더 물어 구분한다 — 어느 쪽이든 부분 변경은 남지 않는다.
        const [still] = (await db.query(`SELECT id FROM items WHERE id = ?1`, [
          itemId,
        ])) as { id: number }[];
        if (!still) return { error: "not_found" };

        if (closesItem) {
          const [open] = (await db.query(
            `SELECT COALESCE(SUM(qty), 0) AS open_qty FROM reservations
              WHERE item_id = ?1 AND status IN ('rented', 'pending', 'reserved')`,
            [itemId],
          )) as { open_qty: number }[];
          if (open.open_qty > 0) return { error: "has_open_reservations" };
        }

        if (qtyTouched) {
          const [active] = (await db.query(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'rented'  THEN qty ELSE 0 END), 0) AS rented_qty,
               COALESCE(SUM(CASE WHEN status = 'pending' THEN qty ELSE 0 END), 0) AS pending_qty,
               COALESCE(SUM(CASE WHEN status = 'reserved' THEN qty ELSE 0 END), 0) AS reserved_qty
             FROM reservations
             WHERE item_id = ?1 AND status IN ('rented', 'pending', 'reserved')`,
            [itemId],
          )) as { rented_qty: number; pending_qty: number; reserved_qty: number }[];
          const rentableNow = nextTotal - nextRepair;
          if (rentableNow < active.rented_qty + active.pending_qty) {
            return { error: "rented_qty_constraint" };
          }
          if (rentableNow < active.reserved_qty) {
            return { error: "reserved_qty_constraint" };
          }
        }
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
type DeleteItemResult =
  | { ok: true }
  | { error: "not_found" }
  | { error: "has_history" };

// R2 오브젝트 삭제 — 하나가 실패해도 나머지를 계속 지운다. 남는 건 회수 가능한 고아뿐이다.
async function deletePhotoObjects(env: Bindings, keys: (string | null)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await env.PHOTOS.delete(key);
    } catch (err) {
      console.error(`R2 사진 삭제 실패 (${key})`, err);
    }
  }
}

export async function deleteItem(
  db: Sql,
  env: Bindings,
  itemId: number,
): Promise<DeleteItemResult> {
  // 대여 이력이 있으면 삭제 대신 폐기를 권한다.
  const [history] = (await db.query(
    `SELECT COUNT(*) AS reservations FROM reservations WHERE item_id = ?1`,
    [itemId],
  )) as { reservations: number }[];
  if (history.reservations > 0) {
    return { error: "has_history" };
  }

  // 사진 R2 키를 먼저 읽는다 — 행은 FK CASCADE 로 함께 지워지지만 R2 오브젝트는 그대로 남아
  // 영구 고아가 되므로 키를 읽어 함께 삭제한다(v3.1). R2 삭제가 일부 실패하면 오브젝트가 남을
  // 수 있으나 키를 잃어 사후 정리조차 못 하는 것보다 낫다.
  // 썸네일(thumb_r2_key)도 같은 이유로 함께 읽는다.
  const keys = (await db.query(
    `SELECT r2_key FROM item_photos WHERE item_id = ?1
     UNION ALL
     SELECT thumb_r2_key FROM item_photos WHERE item_id = ?1 AND thumb_r2_key IS NOT NULL`,
    [itemId],
  )) as { r2_key: string }[];
  // 물품 + FTS 행을 한 트랜잭션으로 — FTS 에 고아가 남지 않는다
  const results = await db.batch<{ id: number }>([
    { sql: `DELETE FROM items WHERE id = ?1 RETURNING id`, params: [itemId] },
    { sql: ftsDeleteSql("?1"), params: [itemId] },
  ]);
  if (results[0].length === 0) return { error: "not_found" };
  uncacheVec(itemId);
  await deletePhotoObjects(env, keys.map((key) => key.r2_key));
  return { ok: true };
}

// ===== 사진 관리 () =====

// 사진 추가 결과 — too_many: 최대 장수 초과 (라우트가 409 응답)
type AddPhotoResult =
  | { ok: true; id: number; url: string; thumb_url: string }
  | { error: "not_found" }
  | { error: "too_many" };

// 사진 URL — 목록·상세 SQL 이 만드는 모양과 같다
function photoUrl(key: string): string {
  return `/api/photos/${key}?access=members`;
}

// 원본과 썸네일은 같은 UUID 를 쓴다 — R2 에서 짝을 눈으로 찾을 수 있게
function thumbKeyFor(itemId: number, uuid: string, ext: string): string {
  return `items/${itemId}/${uuid}.thumb.${ext}`;
}

// thumb — 브라우저가 만든 썸네일(선택). 구버전 클라이언트는 보내지 않는다.
export async function addPhoto(
  db: Sql,
  env: Bindings,
  itemId: number,
  file: File,
  ext: string,
  thumb?: { file: File; ext: string },
): Promise<AddPhotoResult> {
  // 물품 존재 확인
  const exists = (await db.query(`SELECT id FROM items WHERE id = ?1`, [
    itemId,
  ])) as { id: number }[];
  if (exists.length === 0) return { error: "not_found" };

  const uuid = crypto.randomUUID();
  const key = `items/${itemId}/${uuid}.${ext}`;
  const thumbKey = thumb ? thumbKeyFor(itemId, uuid, thumb.ext) : null;
  // 사진 개수 상한을 INSERT 가드로 검사 — COUNT-then-INSERT 사이 동시 업로드로
  // MAX_PHOTOS 를 넘기지 않는다. sort_order 도 같은 문장에서 최댓값+1 로 정한다
  // (등록순 확정 — 대표 사진이 첫 사진이 되는 근거).
  const inserted = (await db.query(
    `INSERT INTO item_photos (item_id, r2_key, sort_order, thumb_r2_key)
     SELECT ?1, ?2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM item_photos WHERE item_id = ?1), ?3
      WHERE (SELECT COUNT(*) FROM item_photos WHERE item_id = ?1) < ${MAX_PHOTOS}
      RETURNING id`,
    [itemId, key, thumbKey],
  )) as { id: number }[];
  if (inserted.length === 0) return { error: "too_many" };
  const photoId = inserted[0].id;

  // R2 업로드가 실패하면 슬롯을 환수한다 — 오브젝트 없는 행(깨진 이미지)을 남기지 않게.
  // 원본은 올라갔는데 썸네일이 실패한 경우도 원본까지 지워 짝이 어긋난 행을 남기지 않는다.
  try {
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    if (thumb && thumbKey) {
      await env.PHOTOS.put(thumbKey, thumb.file.stream(), {
        httpMetadata: { contentType: thumb.file.type },
      });
    }
  } catch (err) {
    await db.query(`DELETE FROM item_photos WHERE id = ?1`, [photoId]);
    await env.PHOTOS.delete(key).catch(() => {});
    throw err;
  }
  return { ok: true, id: photoId, url: photoUrl(key), thumb_url: photoUrl(thumbKey ?? key) };
}

// 기존 사진에 썸네일을 채우거나 바꾼다 — 0013 이전 사진의 백필과, 썸네일이 빠진 사진의 복구.
// 새 썸네일을 먼저 올리고 행을 바꾼 뒤 옛 썸네일을 지운다 — 도중에 실패해도 행이 없는
// 오브젝트를 가리키는 일은 없다(남는 건 회수 가능한 고아뿐, deletePhoto 와 같은 기준).
export async function setPhotoThumb(
  db: Sql,
  env: Bindings,
  itemId: number,
  photoId: number,
  thumb: { file: File; ext: string },
): Promise<{ ok: true; thumb_url: string } | { error: "not_found" }> {
  const [row] = (await db.query(
    `SELECT r2_key, thumb_r2_key FROM item_photos WHERE id = ?1 AND item_id = ?2`,
    [photoId, itemId],
  )) as { r2_key: string; thumb_r2_key: string | null }[];
  if (!row) return { error: "not_found" };

  // 원본 파일명의 UUID 를 그대로 쓰고, 교체 시에는 새 UUID 를 붙여 캐시된 옛 썸네일과 겹치지 않게 한다
  const uuid = row.r2_key.slice(row.r2_key.lastIndexOf("/") + 1).replace(/\..+$/, "");
  const thumbKey = row.thumb_r2_key
    ? thumbKeyFor(itemId, `${uuid}-${crypto.randomUUID()}`, thumb.ext)
    : thumbKeyFor(itemId, uuid, thumb.ext);
  await env.PHOTOS.put(thumbKey, thumb.file.stream(), {
    httpMetadata: { contentType: thumb.file.type },
  });
  const updated = (await db.query(
    `UPDATE item_photos SET thumb_r2_key = ?3 WHERE id = ?1 AND item_id = ?2 RETURNING id`,
    [photoId, itemId, thumbKey],
  )) as { id: number }[];
  if (updated.length === 0) {
    // 그 사이 사진이 지워졌다 — 방금 올린 썸네일을 회수한다
    await env.PHOTOS.delete(thumbKey).catch(() => {});
    return { error: "not_found" };
  }
  if (row.thumb_r2_key) {
    try {
      await env.PHOTOS.delete(row.thumb_r2_key);
    } catch (err) {
      console.error(`R2 옛 썸네일 삭제 실패 (photo ${photoId})`, err);
    }
  }
  return { ok: true, thumb_url: photoUrl(thumbKey) };
}

// 썸네일이 없는 물품 사진 — 관리자 화면의 '썸네일 채우기'가 id 커서로 나눠 받는다.
// `id > after` 로 이어 받으므로, 처리에 실패해 목록에 남은 사진 때문에 같은 페이지를 반복하지
// 않는다(실패분은 다음 실행에서 다시 집는다). id 는 INTEGER PRIMARY KEY 라 단조 증가한다.
export type MissingThumbPhoto = { item_id: number; photo_id: number; url: string };

export async function listPhotosMissingThumb(
  db: Sql,
  after: number,
  limit: number,
): Promise<MissingThumbPhoto[]> {
  return (await db.query(
    `SELECT item_id, id AS photo_id, '/api/photos/' || r2_key || '?access=members' AS url
       FROM item_photos
      WHERE thumb_r2_key IS NULL AND id > ?1
      ORDER BY id
      LIMIT ?2`,
    [after, limit],
  )) as MissingThumbPhoto[];
}

export async function countPhotosMissingThumb(db: Sql): Promise<number> {
  const [row] = (await db.query(
    `SELECT COUNT(*) AS n FROM item_photos WHERE thumb_r2_key IS NULL`,
  )) as { n: number }[];
  return Number(row?.n ?? 0);
}

// 사진 삭제 — 행 먼저 지우고 R2 오브젝트(원본·썸네일)를 지운다. R2 삭제가 실패해도 남는 건
// 회수 가능한 고아 오브젝트뿐이다 (행이 남아 깨진 이미지를 보여주는 것보다 낫다 —
// deleteItem 과 같은 기준). false 면 없음(404)
export async function deletePhoto(
  db: Sql,
  env: Bindings,
  itemId: number,
  photoId: number,
): Promise<boolean> {
  const rows = (await db.query(
    `DELETE FROM item_photos WHERE id = ?1 AND item_id = ?2 RETURNING r2_key, thumb_r2_key`,
    [photoId, itemId],
  )) as { r2_key: string; thumb_r2_key: string | null }[];
  if (rows.length === 0) return false;
  await deletePhotoObjects(env, [rows[0].r2_key, rows[0].thumb_r2_key]);
  return true;
}
