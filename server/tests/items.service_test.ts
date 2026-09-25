// 물품 서비스 단위 테스트 — DB 없이 Sql 스텁
// 회귀 대상: updateItem에 category_ids만 보내면 컬럼 필드가 비어
// `UPDATE items SET  WHERE id = $1` 문법 오류로 500 이 나던 버그.
// 컬럼 갱신·태그·FTS 를 batch 한 장으로 묶은 것(부분 상태 방지)도 여기서 단언하고,
// 실제 SQL 동작은 sqlite 통합 테스트가 검증한다.
import { assertEquals, assertMatch } from "@std/assert";
import { updateItem } from "../src/services/items.service.ts";
import { stubSql } from "./_stub.ts";

type Stmt = { sql: string; params?: unknown[] };

function env(): never {
  // embedItem은 실패해도 삼키는 방어 코드라 env.AI 가 없어도 도는 것으로 간주한다 —
  // 그래도 안전하게 빈 바인딩 객체를 env 로 넣는다
  return {} as never;
}

Deno.test("updateItem: category_ids만 보내면 UPDATE 문 없이 태그 교체 + FTS 동기화를 batch 한 장으로 한다", async () => {
  let stmts: Stmt[] = [];
  const { db, calls } = stubSql({
    query: (text) => (/SELECT id FROM items/.test(text) ? [{ id: 1 }] : []),
    batch: (s) => {
      stmts = s;
      return [];
    },
  });

  const result = await updateItem(db, env(), 1, { category_ids: [3, 5] });

  assertEquals(result, { ok: true });
  // UPDATE 문이 아예 없어야 한다 — 빈 SET 절이 문법 오류를 낸다
  assertEquals(stmts.some((s) => /UPDATE items SET/.test(s.sql)), false);
  // 태그 교체(DELETE→INSERT)와 FTS 동기화(DELETE→INSERT)가 같은 batch 안에 있다 —
  // 도중 실패로 FTS 가 옛 태그를 가리키는 부분 상태가 남지 않는다
  assertMatch(
    stmts.map((s) => s.sql).join("\n"),
    /DELETE FROM item_categories[\s\S]*INSERT INTO item_categories[\s\S]*DELETE FROM items_fts[\s\S]*INSERT INTO items_fts/,
  );
  const tagInsert = stmts.find((s) => /INSERT INTO item_categories/.test(s.sql))!;
  assertEquals(tagInsert.params, [1, JSON.stringify([3, 5])]);
  // 이 경로에서 UPDATE 는 query 로도 실행되지 않는다 (가드 SELECT + embedItem SELECT 뿐)
  assertEquals(calls.some((c) => /UPDATE items/.test(c.text)), false);
});

Deno.test("updateItem: 컬럼 필드와 태그를 함께 보내면 UPDATE 가 batch 첫 문장이다", async () => {
  let stmts: Stmt[] = [];
  const { db } = stubSql({
    query: () => [],
    batch: (s) => {
      stmts = s;
      return [[{ id: 1 }]];
    },
  });

  const result = await updateItem(
    db,
    env(),
    1,
    { name: "새 이름", category_ids: [7] },
  );

  assertEquals(result, { ok: true });
  const upd = stmts[0];
  assertMatch(upd.sql, /UPDATE items SET name = \?2 WHERE id = \?1/);
  assertEquals(upd.params, [1, "새 이름"]);
  assertMatch(stmts.map((s) => s.sql).join("\n"), /INSERT INTO item_categories/);
});

Deno.test("updateItem: 컬럼 필드 전용 수정은 UPDATE 결과 0행으로 not_found를 돌려준다", async () => {
  const { db } = stubSql({
    query: () => [],
    batch: () => [[]],
  });

  assertEquals(await updateItem(db, env(), 999, { name: "없는 물품" }), {
    error: "not_found",
  });
});

Deno.test("updateItem: 태그 전용 수정에서 물품이 없으면 not_found를 돌려준다", async () => {
  const { db } = stubSql({
    query: () => [],
    batch: () => [],
  });

  assertEquals(await updateItem(db, env(), 999, { category_ids: [1] }), {
    error: "not_found",
  });
});

Deno.test("updateItem: DB CHECK 위반은 qty_constraint로 매핑한다", async () => {
  // 사전 검사는 통과(3 ≤ 5)하지만 batch 사이 값이 바뀌어 CHECK 가 거절한 상황 —
  // 500 이 아니라 친절한 400(qty_constraint)으로 매핑된다
  const { db } = stubSql({
    query: () => [{ total_qty: 5, qty_broken: 0 }],
    batch: () => {
      throw new Error("CHECK constraint failed: qty_broken <= total_qty");
    },
  });

  assertEquals(
    await updateItem(db, env(), 1, { total_qty: 5, qty_broken: 3 }),
    { error: "qty_constraint" },
  );
});
