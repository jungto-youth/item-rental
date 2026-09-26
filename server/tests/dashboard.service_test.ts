// 현황(dashboard) 서비스 단위 테스트 — DB 없이 Sql 스텁
// 회귀 대상: 물품 쿼리(Q1)·대여자 쿼리(Q2)를 병렬로 받아 대여자를 물품별로 묶는 조립.
// 실제 SQL 동작은 sqlite 통합 테스트가 검증한다.
import { assertEquals } from "@std/assert";
import { getDashboard } from "../src/services/dashboard.service.ts";
import { stubSql } from "./_stub.ts";

// Q1(FROM items)과 Q2(JOIN members — 현재 대여자)를 SQL 텍스트로 구분해 응답한다
function dashboardStub(items: Record<string, unknown>[], renters: Record<string, unknown>[]) {
  return stubSql({
    query: (text) => (/JOIN members/.test(text) ? renters : items),
    batch: () => [],
  });
}

Deno.test("getDashboard: 물품 전체 쿼리와 현재 대여자 쿼리 두 장을 발행한다", async () => {
  const { db, calls } = dashboardStub(
    [{
      id: 1,
      name: "텐트",
      kind: "rental",
      status: "active",
      total_qty: 2,
      qty_broken: 0,
      rentable_qty: 2,
      active_now: 0,
      photo: null,
    }],
    [],
  );

  await getDashboard(db);

  assertEquals(calls.length, 2);
  const texts = calls.map((c) => c.text).join("\n");
  // Q1 — 폐기 포함 전체 물품 (WHERE 필터가 없다 — 화면이 상태별로 그룹핑)
  assertEquals(/FROM items ORDER BY/.test(texts), true);
  // Q2 — 대여 중(rented)인 행만 대여자로 뽑는다
  assertEquals(/WHERE r\.status = 'rented'/.test(texts), true);
});

Deno.test("getDashboard: 현재 대여자를 물품별로 묶는다", async () => {
  const { db } = dashboardStub(
    [
      {
        id: 1,
        name: "텐트",
        kind: "rental",
        status: "active",
        total_qty: 3,
        qty_broken: 0,
        rentable_qty: 3,
        active_now: 3,
        photo: "/api/photos/a.jpg",
      },
      {
        id: 2,
        name: "램프",
        kind: "rental",
        status: "active",
        total_qty: 2,
        qty_broken: 1,
        rentable_qty: 1,
        active_now: 1,
        photo: null,
      },
    ],
    [
      { item_id: 1, member_name: "철수", member_phone: "010-1111-2222", qty: 1 },
      { item_id: 2, member_name: "민수", member_phone: null, qty: 1 },
      { item_id: 1, member_name: "영희", member_phone: null, qty: 2 },
    ],
  );

  const { items } = await getDashboard(db);

  assertEquals(items.find((it) => it.id === 1)?.current_renters, [
    { member_name: "철수", member_phone: "010-1111-2222", qty: 1 },
    { member_name: "영희", member_phone: null, qty: 2 },
  ]);
  assertEquals(items.find((it) => it.id === 2)?.current_renters, [
    { member_name: "민수", member_phone: null, qty: 1 },
  ]);
});

Deno.test("getDashboard: 대여자가 없는 물품은 current_renters 가 빈 배열이다", async () => {
  const { db } = dashboardStub(
    [{
      id: 1,
      name: "텐트",
      kind: "rental",
      status: "active",
      total_qty: 2,
      qty_broken: 0,
      rentable_qty: 2,
      active_now: 0,
      photo: null,
    }],
    [],
  );

  const { items } = await getDashboard(db);

  assertEquals(items, [
    {
      id: 1,
      name: "텐트",
      kind: "rental",
      status: "active",
      total_qty: 2,
      qty_broken: 0,
      rentable_qty: 2,
      active_now: 0,
      photo: null,
      current_renters: [],
    },
  ]);
});
