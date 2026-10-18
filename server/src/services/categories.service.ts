// 카테고리 도메인 서비스 — 목록/생성/이름변경/삭제 SQL 소유
// 카테고리는 관리자가 물품 등록·수정 중에 만드는 가벼운 분류로,
// 별도 정렬 컬럼 없이 이름순으로 보여준다. 삭제 시 연결은 조인 행이
// (ON DELETE CASCADE) 함께 사라져 물품은 그대로 남는다 — 태그만 없어진다.
// 이름은 검색 색인(items_fts.tags)에도 복사돼 있으므로 쓰기 경로는 색인까지 함께 고친다
// (item-fts.service) — 이름만 고치면 그 이름으로 검색해도 물품이 안 나온다.
import type { Category } from "../../../shared/api-types";
import type { Sql } from "../db";
import { categoryItemIds, ftsResyncByIds } from "./item-fts.service";

export async function listCategories(db: Sql): Promise<Category[]> {
  const rows = (await db.query(
    `SELECT c.id, c.name, COUNT(ic.item_id) AS item_count
     FROM categories c
     LEFT JOIN item_categories ic ON ic.category_id = c.id
     GROUP BY c.id, c.name
     ORDER BY c.name`,
  )) as Category[];
  return rows;
}

export type CategoryWriteResult =
  | { ok: true; id: number }
  | { error: "dup" }
  | { error: "not_found" };

// 이름 중복은 UNIQUE 제약이 잡는다 — Postgres 오류 코드 23505 와 달리 D1(SQLite)은
// 메시지로만 판별한다 ("UNIQUE constraint failed: categories.name")
// 문장 목록을 batch 한 장으로 실행한다 — 카테고리 행을 쓰는 첫 문장과 색인 재동기화 문장이
// 한 트랜잭션에 묶여 "이름은 바뀌었는데 색인은 옛 이름" 같은 부분 상태가 남지 않는다.
async function runWithDup(
  db: Sql,
  stmts: { sql: string; params?: unknown[] }[],
): Promise<{ ok: true; id: number } | { error: "dup" } | { error: "not_found" }> {
  try {
    const results = await db.batch<{ id: number }>(stmts);
    const rows = results[0] ?? [];
    if (rows.length === 0) return { error: "not_found" };
    return { ok: true, id: rows[0].id };
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
      return { error: "dup" };
    }
    throw err;
  }
}

export async function createCategory(
  db: Sql,
  name: string,
): Promise<CategoryWriteResult> {
  return runWithDup(db, [
    { sql: `INSERT INTO categories (name) VALUES (?1) RETURNING id`, params: [name] },
  ]);
}

// 이름변경 — 붙은 물품의 검색 색인 태그도 새 이름으로 다시 만든다.
export async function renameCategory(
  db: Sql,
  id: number,
  name: string,
): Promise<CategoryWriteResult> {
  const itemIds = await categoryItemIds(db, id);
  return runWithDup(db, [
    { sql: `UPDATE categories SET name = ?2 WHERE id = ?1 RETURNING id`, params: [id, name] },
    ...ftsResyncByIds(itemIds),
  ]);
}

// 삭제 — 물품은 남고 태그만 없어진다(조인 행은 CASCADE). 색인에는 그 이름이 그대로 남아
// 있으므로 영향받는 물품 id 를 먼저 확보해 삭제와 같은 batch 에서 색인을 다시 만든다 —
// CASCADE 가 끝난 뒤에는 어느 물품이었는지 물어볼 수 없다.
export async function deleteCategory(
  db: Sql,
  id: number,
): Promise<{ ok: true } | { error: "not_found" }> {
  const itemIds = await categoryItemIds(db, id);
  const result = await runWithDup(db, [
    { sql: `DELETE FROM categories WHERE id = ?1 RETURNING id`, params: [id] },
    ...ftsResyncByIds(itemIds),
  ]);
  // 삭제에는 UNIQUE 충돌이 없다 — runWithDup 의 dup 은 여기서 나올 수 없다
  return "error" in result ? { error: "not_found" } : { ok: true };
}
