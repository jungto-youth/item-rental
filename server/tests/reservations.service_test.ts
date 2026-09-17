// 예약 서비스 단위 테스트 — DB 없이 돌아간다 (Sql 스텁)
// 회귀 대상(P0-1): createReservation이 transaction() 결과에서 advisory 락 SELECT를
// INSERT 결과로 오인해, 재고가 없어도 {ok:true, id:undefined}로 201을 내주던 버그.
/// <reference types="@cloudflare/workers-types" />
import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
} from "@std/assert";
import {
  createReservation,
  validateReservation,
  type CreateReservationParams,
  type ReserveItem,
} from "../src/services/reservations.service.ts";
import type { Sql } from "../src/db.ts";

type Row = Record<string, unknown>;
type Query = { text: string; values: unknown[] };

// neon Sql의 최소 스텁 — 태그드 템플릿 호출(트랜잭션 배치 구성)과 query()·transaction()만
// 흉내낸다. 실제 SQL은 실행하지 않고, 각 쿼리의 텍스트·바인딩만 기록한다.
function stubSql(script: {
  query: (text: string, values: unknown[]) => Row[];
  transaction: (queries: Query[]) => unknown;
}) {
  const calls: Query[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Query => {
    const query = { text: strings.join("?"), values };
    calls.push(query);
    return query;
  };
  const db = Object.assign(tag, {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return script.query(text, values);
    },
    transaction: async (queries: Query[]) => script.transaction(queries),
  });
  return { db: db as unknown as Sql, calls };
}

// 대여 가능한 물품 (재고 2, 수리중 0, 최대 7일)
const RENTAL_ITEM: ReserveItem = {
  id: 1,
  status: "active",
  kind: "rental",
  max_days: 7,
  total_qty: 2,
  qty_broken: 0,
};

function params(overrides: Partial<CreateReservationParams> = {}): CreateReservationParams {
  return {
    itemId: 1,
    memberId: "member-1",
    startDate: "2026-09-20",
    endDate: "2026-09-22",
    memo: null,
    qty: 1,
    days: 2,
    ...overrides,
  };
}

// ===== P0-1 회귀 =====

Deno.test("createReservation: INSERT가 0행이면 성공으로 오인하지 않는다 (advisory 락 SELECT는 1행)", async () => {
  // transaction() 결과는 쿼리 순서와 1:1 — [SET LOCAL, advisory 락 SELECT, INSERT]
  // 락 SELECT는 항상 1행이라, 이를 INSERT 결과로 읽으면 재고가 없어도 성공이 된다.
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: () => [[], [{ pg_advisory_xact_lock: null }], []],
  });

  const result = await createReservation(db, params());

  // 옛 코드(results[1])는 {ok:true, id:undefined}를 반환해 이 단언이 실패한다
  assertEquals(result, { error: "no_availability" });
  assert(!("ok" in result), "성공으로 오인하면 안 된다");
});

Deno.test("createReservation: 마지막 쿼리가 실제 삽입 결과다 (3문장 배치 불변식)", async () => {
  let batch: Query[] = [];
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: (queries) => {
      batch = queries;
      return [[], [{ pg_advisory_xact_lock: null }], [{ id: 42 }]];
    },
  });

  const result = await createReservation(db, params());

  assertEquals(result, { ok: true, id: 42 });
  // results.at(-1) 전제 — 누군가 INSERT 뒤에 문장을 덧붙이면 이 단언이 깨진다
  assertEquals(batch.length, 3, "트랜잭션은 [SET LOCAL, 락, INSERT] 3문장이어야 한다");
  assertMatch(batch[0].text, /SET LOCAL lock_timeout/);
  assertMatch(batch.at(-1)!.text, /INSERT INTO reservations/);
});

Deno.test("createReservation: 0행 후 재조회에서 기간 초과를 가려낸다", async () => {
  const { db } = stubSql({
    // 사전 검사는 7일이라 통과하지만, 신청 사이 운영진이 3일로 줄인 상황
    // (사전 검사는 "SELECT id, status…", 거절 후 재조회는 "SELECT status…")
    query: (text) =>
      text.startsWith("SELECT id, status") ? [RENTAL_ITEM] : [{ ...RENTAL_ITEM, max_days: 3 }],
    transaction: () => [[], [{ pg_advisory_xact_lock: null }], []],
  });

  const result = await createReservation(db, params({ days: 5 }));

  assertEquals(result, { error: "too_long", maxDays: 3 });
});

// ===== 실패 신호 구분 =====

Deno.test("createReservation: 물품이 없으면 transaction을 열지 않는다", async () => {
  let opened = false;
  const { db } = stubSql({
    query: () => [],
    transaction: () => {
      opened = true;
      return [];
    },
  });

  const result = await createReservation(db, params());

  assertEquals(result, { error: "not_found" });
  assertEquals(opened, false);
});

Deno.test("createReservation: 신청 사이 물품 삭제(FK 23503)는 not_found", async () => {
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: () => {
      throw Object.assign(new Error("fk"), { code: "23503" });
    },
  });

  assertEquals(await createReservation(db, params()), { error: "not_found" });
});

Deno.test("createReservation: 락 대기 초과(55P03)는 busy", async () => {
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: () => {
      throw Object.assign(new Error("lock timeout"), { code: "55P03" });
    },
  });

  assertEquals(await createReservation(db, params()), { error: "busy" });
});

Deno.test("createReservation: 알 수 없는 DB 오류는 삼키지 않고 던진다", async () => {
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: () => {
      throw Object.assign(new Error("boom"), { code: "XX000" });
    },
  });

  await assertRejects(() => createReservation(db, params()), Error, "boom");
});

// ===== validateReservation (순수 함수) =====

Deno.test("validateReservation: 통과 — 재고 2 중 1개, 2일", () => {
  assertEquals(validateReservation(RENTAL_ITEM, { qty: 1, days: 2 }), { ok: true });
});

Deno.test("validateReservation: max_days가 대여 기간의 유일한 출처다", () => {
  // settings 같은 전역 설정은 없다 — 물품 컬럼만 본다 (§4.2·§4.3)
  assertEquals(validateReservation(RENTAL_ITEM, { qty: 1, days: 7 }), { ok: true });
  assertEquals(validateReservation(RENTAL_ITEM, { qty: 1, days: 8 }), {
    error: "too_long",
    maxDays: 7,
  });
  assertEquals(
    validateReservation({ ...RENTAL_ITEM, max_days: 3 }, { qty: 1, days: 4 }),
    { error: "too_long", maxDays: 3 },
  );
});

Deno.test("validateReservation: 수리중을 뺀 재고로 수량을 본다", () => {
  const broken: ReserveItem = { ...RENTAL_ITEM, total_qty: 5, qty_broken: 3 };
  assertEquals(validateReservation(broken, { qty: 2, days: 1 }), { ok: true });
  assertEquals(validateReservation(broken, { qty: 3, days: 1 }), {
    error: "too_many",
    rentable: 2,
  });
});

Deno.test("validateReservation: 비활성 물품·소모품을 거른다", () => {
  assertEquals(
    validateReservation({ ...RENTAL_ITEM, status: "inactive" }, { qty: 1, days: 1 }),
    { error: "item_not_active" },
  );
  assertEquals(
    validateReservation({ ...RENTAL_ITEM, kind: "consumable" }, { qty: 1, days: 1 }),
    { error: "consumable" },
  );
});
