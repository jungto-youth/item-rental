// 카테고리 서비스 단위 테스트 — DB 없이 Sql 스텁
// 회귀 대상: UNIQUE 제약 충돌을 Postgres 오류 코드 대신 메시지로 판별하는 dup 매핑.
// 실제 제약 동작은 sqlite 통합 테스트가 검증한다.
import { assertEquals, assertMatch } from "@std/assert";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "../src/services/categories.service.ts";
import { stubSql } from "./_stub.ts";

Deno.test("listCategories: 태그 개수 집계를 위해 LEFT JOIN + GROUP BY + 이름순 SELECT 를 발행한다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 1, name: "캠핑", item_count: 3 }],
    batch: () => [],
  });

  const rows = await listCategories(db);

  assertEquals(rows, [{ id: 1, name: "캠핑", item_count: 3 }]);
  // LEFT JOIN — 물품이 없는 카테고리도 item_count 0 으로 나와야 한다
  assertMatch(calls[0].text, /LEFT JOIN item_categories/);
  assertMatch(calls[0].text, /GROUP BY/);
  assertMatch(calls[0].text, /ORDER BY c\.name/);
});

Deno.test("createCategory: 이름을 바인딩하고 RETURNING id 를 결과로 돌려준다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 7 }],
    batch: () => [],
  });

  const result = await createCategory(db, "등산");

  assertEquals(result, { ok: true, id: 7 });
  assertEquals(calls[0].values, ["등산"]);
  assertMatch(calls[0].text, /INSERT INTO categories/);
  assertMatch(calls[0].text, /RETURNING id/);
});

Deno.test("createCategory: UNIQUE 제약 충돌 메시지를 dup 으로 매핑한다 (409)", async () => {
  const { db } = stubSql({
    query: () => {
      throw new Error("UNIQUE constraint failed: categories.name");
    },
    batch: () => [],
  });

  const result = await createCategory(db, "캠핑");

  assertEquals(result, { error: "dup" });
});

Deno.test("createCategory: 알 수 없는 DB 오류는 삼키지 않고 던진다", async () => {
  const { db } = stubSql({
    query: () => {
      throw new Error("disk I/O error");
    },
    batch: () => [],
  });

  let thrown: unknown;
  try {
    await createCategory(db, "캠핑");
  } catch (err) {
    thrown = err;
  }
  assertEquals(thrown instanceof Error && thrown.message, "disk I/O error");
});

Deno.test("renameCategory: id·이름 순으로 바인딩한다 (?2=이름, ?1=id)", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 3 }],
    batch: () => [],
  });

  const result = await renameCategory(db, 3, "수련");

  assertEquals(result, { ok: true, id: 3 });
  assertEquals(calls[0].values, [3, "수련"]);
});

Deno.test("renameCategory: RETURNING 이 0행이면 not_found 를 돌려준다 (404)", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [] });

  const result = await renameCategory(db, 999, "수련");

  assertEquals(result, { error: "not_found" });
});

Deno.test("deleteCategory: 1행이면 성공 — 조인 행은 CASCADE 로 함께 사라진다", async () => {
  const { db } = stubSql({ query: () => [{ id: 3 }], batch: () => [] });

  const result = await deleteCategory(db, 3);

  assertEquals(result, { ok: true });
});

Deno.test("deleteCategory: 0행이면 not_found (404)", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [] });

  const result = await deleteCategory(db, 999);

  assertEquals(result, { error: "not_found" });
});
