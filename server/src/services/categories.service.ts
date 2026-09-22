// 카테고리 도메인 서비스 — 목록/생성/이름변경/삭제 SQL 소유
// 카테고리는 관리자가 물품 등록·수정 중에 만드는 가벼운 분류로,
// 별도 정렬 컬럼 없이 이름순으로 보여준다. 삭제 시 연결은 조인 행이
// (ON DELETE CASCADE) 함께 사라져 물품은 그대로 남는다 — 태그만 없어진다.
import type { Sql } from "../db";

export type CategoryRow = { id: number; name: string; item_count: number };

export async function listCategories(db: Sql): Promise<CategoryRow[]> {
  const rows = (await db.query(
    `SELECT c.id, c.name, COUNT(ic.item_id)::int AS item_count
     FROM categories c
     LEFT JOIN item_categories ic ON ic.category_id = c.id
     GROUP BY c.id, c.name
     ORDER BY c.name`,
  )) as CategoryRow[];
  return rows;
}

export type CategoryWriteResult =
  | { ok: true; id: number }
  | { error: "dup" }
  | { error: "not_found" };

// 이름 중복은 UNIQUE 제약이 잡는다 — Postgres 오류 코드 23505 를 dup 으로 매핑
async function runWithDup(
  db: Sql,
  sql: string,
  params: unknown[],
): Promise<{ ok: true; id: number } | { error: "dup" } | { error: "not_found" }> {
  try {
    const rows = (await db.query(sql, params)) as { id: number }[];
    if (rows.length === 0) return { error: "not_found" };
    return { ok: true, id: rows[0].id };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "dup" };
    throw err;
  }
}

export async function createCategory(
  db: Sql,
  name: string,
): Promise<CategoryWriteResult> {
  return runWithDup(db, `INSERT INTO categories (name) VALUES ($1) RETURNING id`, [name]);
}

export async function renameCategory(
  db: Sql,
  id: number,
  name: string,
): Promise<CategoryWriteResult> {
  return runWithDup(
    db,
    `UPDATE categories SET name = $2 WHERE id = $1 RETURNING id`,
    [id, name],
  );
}

export async function deleteCategory(
  db: Sql,
  id: number,
): Promise<{ ok: true } | { error: "not_found" }> {
  const rows = (await db.query(`DELETE FROM categories WHERE id = $1 RETURNING id`, [
    id,
  ])) as { id: number }[];
  return rows.length === 0 ? { error: "not_found" } : { ok: true };
}
