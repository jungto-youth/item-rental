// 카테고리 서비스 단위 테스트 — DB 없이 Sql 스텁
// 회귀 대상: UNIQUE 제약 충돌을 Postgres 오류 코드 대신 메시지로 판별하는 dup 매핑,
// 그리고 이름변경·삭제가 검색 색인(items_fts) 재동기화를 같은 batch 에 묶는지.
// 실제 SQL 동작은 sqlite 통합 테스트가 검증한다.
import { test, expect } from "vitest";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "../src/services/categories.service.ts";
import { stubSql, type Query } from "./_stub.ts";

test("listCategories: 태그 개수 집계를 위해 LEFT JOIN + GROUP BY + 이름순 SELECT 를 발행한다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 1, name: "캠핑", item_count: 3 }],
    batch: () => [],
  });

  const rows = await listCategories(db);

  expect(rows).toEqual([{ id: 1, name: "캠핑", item_count: 3 }]);
  // LEFT JOIN — 물품이 없는 카테고리도 item_count 0 으로 나와야 한다
  expect(calls[0].text).toMatch(/LEFT JOIN item_categories/);
  expect(calls[0].text).toMatch(/GROUP BY/);
  expect(calls[0].text).toMatch(/ORDER BY c\.name/);
});

test("createCategory: 이름을 바인딩하고 RETURNING id 를 결과로 돌려준다", async () => {
  let stmts: Query[] = [];
  const { db } = stubSql({
    query: () => [],
    batch: (s) => {
      stmts = s;
      return [[{ id: 7 }]];
    },
  });

  const result = await createCategory(db, "등산");

  expect(result).toEqual({ ok: true, id: 7 });
  expect(stmts[0].params).toEqual(["등산"]);
  expect(stmts[0].sql).toMatch(/INSERT INTO categories/);
  expect(stmts[0].sql).toMatch(/RETURNING id/);
});

test("createCategory: UNIQUE 제약 충돌 메시지를 dup 으로 매핑한다 (409)", async () => {
  const { db } = stubSql({
    query: () => [],
    batch: () => {
      throw new Error("UNIQUE constraint failed: categories.name");
    },
  });

  const result = await createCategory(db, "캠핑");

  expect(result).toEqual({ error: "dup" });
});

test("createCategory: 알 수 없는 DB 오류는 삼키지 않고 던진다", async () => {
  const { db } = stubSql({
    query: () => [],
    batch: () => {
      throw new Error("disk I/O error");
    },
  });

  let thrown: unknown;
  try {
    await createCategory(db, "캠핑");
  } catch (err) {
    thrown = err;
  }
  expect(thrown instanceof Error && thrown.message).toEqual("disk I/O error");
});

test("renameCategory: UPDATE 뒤에 붙은 물품의 색인 재동기화를 같은 batch 에 넣는다", async () => {
  let stmts: Query[] = [];
  const { db, calls } = stubSql({
    query: (text) => (/FROM item_categories/.test(text) ? [{ id: 1 }, { id: 2 }] : []),
    batch: (s) => {
      stmts = s;
      return [[{ id: 3 }]];
    },
  });

  const result = await renameCategory(db, 3, "수련");

  expect(result).toEqual({ ok: true, id: 3 });
  // 색인 재동기화 대상은 이름을 바꾸기 전에 읽는다 — 조인 테이블은 이름과 무관하지만
  // batch 안에서 옛 이름을 보고 만든 색인을 남기지 않으려면 대상 목록이 먼저 필요하다
  expect(calls[0].values).toEqual([3]);
  expect(calls[0].text).toMatch(/FROM item_categories/);
  // id·이름 순으로 바인딩한다 (?2=이름, ?1=id)
  expect(stmts[0].sql).toMatch(/UPDATE categories SET name = \?2 WHERE id = \?1/);
  expect(stmts[0].params).toEqual([3, "수련"]);
  // 색인은 삭제 → 생성, 대상은 그 카테고리에 붙어 있던 물품들
  expect(stmts.map((s) => s.sql).join("\n")).toMatch(
    /UPDATE categories[\s\S]*DELETE FROM items_fts[\s\S]*INSERT INTO items_fts/,
  );
  expect(stmts[1].params).toEqual([JSON.stringify([1, 2])]);
  expect(stmts[2].params).toEqual([JSON.stringify([1, 2])]);
});

test("renameCategory: RETURNING 이 0행이면 not_found 를 돌려준다 (404)", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [[]] });

  const result = await renameCategory(db, 999, "수련");

  expect(result).toEqual({ error: "not_found" });
});

test("renameCategory: 붙은 물품이 없으면 UPDATE 한 문장만 보낸다", async () => {
  let stmts: Query[] = [];
  const { db } = stubSql({
    query: () => [],
    batch: (s) => {
      stmts = s;
      return [[{ id: 3 }]];
    },
  });

  expect(await renameCategory(db, 3, "수련")).toEqual({ ok: true, id: 3 });
  // 빈 목록에 no-op 색인 문장을 만들지 않는다
  expect(stmts).toHaveLength(1);
});

test("deleteCategory: 1행이면 성공 — 조인 행은 CASCADE 로, 색인은 같은 batch 에서 비운다", async () => {
  let stmts: Query[] = [];
  const { db, calls } = stubSql({
    query: (text) => (/FROM item_categories/.test(text) ? [{ id: 5 }] : []),
    batch: (s) => {
      stmts = s;
      return [[{ id: 3 }]];
    },
  });

  const result = await deleteCategory(db, 3);

  expect(result).toEqual({ ok: true });
  // CASCADE 가 끝나면 어느 물품이었는지 물어볼 수 없다 — 삭제 전에 확보한다
  expect(calls[0].values).toEqual([3]);
  expect(stmts[0].sql).toMatch(/DELETE FROM categories/);
  expect(stmts.map((s) => s.sql).join("\n")).toMatch(
    /DELETE FROM categories[\s\S]*DELETE FROM items_fts[\s\S]*INSERT INTO items_fts/,
  );
  expect(stmts[1].params).toEqual([JSON.stringify([5])]);
});

test("deleteCategory: 0행이면 not_found (404)", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [[]] });

  const result = await deleteCategory(db, 999);

  expect(result).toEqual({ error: "not_found" });
});
