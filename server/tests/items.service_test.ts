// 물품 서비스 단위 테스트 — DB 없이 Sql 스텁
// 회귀 대상: updateItem에 category_ids만 보내면 컬럼 필드가 비어
// `UPDATE items SET  WHERE id = $1` 문법 오류로 500 이 나던 버그.
import { assertEquals, assertMatch } from "@std/assert";
import { updateItem } from "../src/services/items.service.ts";
import { stubSql } from "./_stub.ts";

function env(): never {
  // embedItem은 실패해도 삼키는 방어 코드라 env.AI 가 없어도 도는 것으로 간주한다 —
  // 그래도 안전하게 빈 바인딩 객체를 env 로 넣는다
  return {} as never;
}

Deno.test("updateItem: category_ids만 보내면 UPDATE를 건너뛰고 태그 교체만 한다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (/SELECT id FROM items/.test(text) ? [{ id: 1 }] : []),
    transaction: () => [],
  });

  const result = await updateItem(
    db,
    env(),
    1,
    { category_ids: [3, 5] },
  );

  assertEquals(result, { ok: true });
  // UPDATE 문이 아예 실행되지 않아야 한다 — 빈 SET 절이 문법 오류를 낸다
  assertEquals(
    calls.some((c) => /UPDATE items SET/.test(c.text) && c.text.includes("SET ")),
    false,
  );
  // 존재 확인 SELECT + DELETE + INSERT 2개(태그 3,5)
  const inserts = calls.filter((c) => /INSERT INTO item_categories/.test(c.text));
  assertEquals(inserts.length, 2);
  assertEquals(
    calls.some((c) => /DELETE FROM item_categories/.test(c.text)),
    true,
  );
});

Deno.test("updateItem: 컬럼 필드와 태그를 함께 보내면 둘 다 반영한다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (/UPDATE items SET/.test(text) ? [{ id: 1 }] : []),
    transaction: () => [],
  });

  const result = await updateItem(
    db,
    env(),
    1,
    { name: "새 이름", category_ids: [7] },
  );

  assertEquals(result, { ok: true });
  const update = calls.find((c) => /UPDATE items SET/.test(c.text))!;
  assertMatch(update.text, /name = \$2/);
  assertEquals(update.values, [1, "새 이름"]);
  assertEquals(calls.filter((c) => /INSERT INTO item_categories/.test(c.text)).length, 1);
});

Deno.test("updateItem: 컬럼 필드 전용 수정은 UPDATE 결과로 not_found를 구분한다", async () => {
  const { db } = stubSql({
    query: () => [],
    transaction: () => [],
  });

  assertEquals(await updateItem(db, env(), 999, { name: "없는 물품" }), {
    error: "not_found",
  });
});

Deno.test("updateItem: 태그 전용 수정에서 물품이 없으면 not_found를 돌려준다", async () => {
  const { db } = stubSql({
    query: () => [],
    transaction: () => [],
  });

  assertEquals(await updateItem(db, env(), 999, { category_ids: [1] }), {
    error: "not_found",
  });
});
