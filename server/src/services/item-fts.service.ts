// items_fts(키워드 검색 색인) 재동기화 SQL — 이름·설명·위치와 태그(카테고리 이름)를 한 행에 모은다.
// 색인을 다시 만드는 경로가 물품(items.service.ts)과 카테고리(categories.service.ts)로 나뉘어 있다.
// 태그는 그 시점 카테고리 이름의 복사본이라, 이름이 바뀌는 쪽에서 문장을 다시 돌리지 않으면
// 색인만 옛 이름을 들고 남는다 — SQL 을 경로마다 베껴 두면 한쪽만 고쳐지는 일이 생긴다.
// 그래서 문장은 여기서만 만들고 호출부는 조건식만 준다.
import type { Sql } from "../db";

// 조건식은 호출부가 준다 — 단건(?1)과 여러 건(json_each)을 같은 문장으로 다루기 위해서다.
export function ftsDeleteSql(rowidPredicate: string): string {
  return `DELETE FROM items_fts WHERE rowid IN (${rowidPredicate})`;
}

export function ftsInsertSql(idPredicate: string): string {
  return `INSERT INTO items_fts (rowid, name, description, location, tags)
        SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(i.location, ''),
               COALESCE((SELECT group_concat(c.name, ' ')
                  FROM (SELECT c.name FROM item_categories ic
                         JOIN categories c ON c.id = ic.category_id
                        WHERE ic.item_id = i.id ORDER BY c.name) c), '')
          FROM items i WHERE ${idPredicate}`;
}

// 물품 id 목록의 색인 행을 다시 만든다 (삭제 → 생성).
// batch 에 넣을 문장 목록을 돌려준다 — 색인만 바뀌고 카테고리 이름이 그대로이거나 그 반대인
// 부분 상태가 남지 않게, 호출부가 자기 UPDATE·DELETE 와 같은 batch 에 넣는다.
// 빈 목록이면 빈 배열 — 붙은 물품이 없는 카테고리를 건드릴 때 no-op 문장을 만들지 않는다.
export function ftsResyncByIds(itemIds: number[]): { sql: string; params: unknown[] }[] {
  if (itemIds.length === 0) return [];
  const ids = JSON.stringify(itemIds);
  const rowids = `SELECT value FROM json_each(?1)`;
  return [
    { sql: ftsDeleteSql(rowids), params: [ids] },
    { sql: ftsInsertSql(`i.id IN (${rowids})`), params: [ids] },
  ];
}

// 카테고리 하나에 붙은 물품 id — 색인 재동기화 대상.
// 이름변경은 UPDATE 뒤에, 삭제는 조인 행이 CASCADE 로 사라지기 전에 불러야 한다.
export async function categoryItemIds(
  db: Sql,
  categoryId: number,
): Promise<number[]> {
  const rows = (await db.query(
    `SELECT ic.item_id AS id FROM item_categories ic WHERE ic.category_id = ?1`,
    [categoryId],
  )) as { id: number }[];
  return rows.map((r) => r.id);
}
