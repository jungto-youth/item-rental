// 대여 서비스 단위 테스트 — DB 없이 돌아간다 (Sql 스텁)
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
  cancelReservation,
  returnReservationByMember,
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

// 대여 가능한 물품 (재고 2, 수리중 0)
const RENTAL_ITEM: ReserveItem = {
  id: 1,
  status: "active",
  kind: "rental",
  total_qty: 2,
  qty_broken: 0,
};

function params(overrides: Partial<CreateReservationParams> = {}): CreateReservationParams {
  return {
    itemId: 1,
    memberId: "member-1",
    memo: null,
    qty: 1,
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

Deno.test("createReservation: 가드 INSERT가 대여 중(rented) 수량만 점유로 센다", async () => {
  // 날짜가 없어져 가용성은 "지금 대여 중인 수량의 합"만 본다. 반납·취소는 점유에서 빠져야
  // 그 수량을 다시 빌려줄 수 있다 — status = 'rented' 조건이 그 근거다.
  let batch: Query[] = [];
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: (queries) => {
      batch = queries;
      return [[], [{ pg_advisory_xact_lock: null }], [{ id: 7 }]];
    },
  });

  await createReservation(db, params());

  const insert = batch.at(-1)!.text;
  assertMatch(insert, /status = 'rented'/);
  assertMatch(insert, /SUM\(r\.qty\)/);
  // 옛 일별 점유 검사(generate_series)가 남아 있으면 날짜 컬럼 삭제 후 런타임 오류가 난다
  assert(!/generate_series/.test(insert), "일별 점유 검사가 남아 있으면 안 된다");
  assert(!/start_date|end_date/.test(insert), "삭제된 날짜 컬럼을 참조하면 안 된다");
});

Deno.test("createReservation: 신청 즉시 rented 상태로 INSERT한다", async () => {
  // 승인 단계가 없어졌다 — pending으로 넣으면 아무도 승인하지 않아 영원히 대여되지 않는다
  let batch: Query[] = [];
  const { db } = stubSql({
    query: () => [RENTAL_ITEM],
    transaction: (queries) => {
      batch = queries;
      return [[], [{ pg_advisory_xact_lock: null }], [{ id: 1 }]];
    },
  });

  await createReservation(db, params());

  assertMatch(batch.at(-1)!.text, /'rented'/);
  assert(!/'pending'/.test(batch.at(-1)!.text), "pending 상태는 더 이상 쓰지 않는다");
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

Deno.test("validateReservation: 통과 — 재고 2 중 1개", () => {
  assertEquals(validateReservation(RENTAL_ITEM, { qty: 1 }), { ok: true });
});

Deno.test("validateReservation: 수리중을 뺀 재고로 수량을 본다", () => {
  const broken: ReserveItem = { ...RENTAL_ITEM, total_qty: 5, qty_broken: 3 };
  assertEquals(validateReservation(broken, { qty: 2 }), { ok: true });
  assertEquals(validateReservation(broken, { qty: 3 }), {
    error: "too_many",
    rentable: 2,
  });
});

Deno.test("validateReservation: 비활성 물품·소모품을 거른다", () => {
  assertEquals(
    validateReservation({ ...RENTAL_ITEM, status: "inactive" }, { qty: 1 }),
    { error: "item_not_active" },
  );
  assertEquals(
    validateReservation({ ...RENTAL_ITEM, kind: "consumable" }, { qty: 1 }),
    { error: "consumable" },
  );
});

// ===== 본인 반납·취소 (ownAction) =====
// 반납은 관리자와 회원이 모두 할 수 있다. 회원 경로의 안전 조건은
// "본인 + 대여 중(rented)" 두 가지이고, 어긋나면 404/409 로 갈린다.

Deno.test("returnReservationByMember: 본인 + 대여 중이면 성공한다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    transaction: () => [],
  });

  const result = await returnReservationByMember(db, 5, "member-1");

  assertEquals(result, { ok: true });
  // 회원 경로는 admin_id 를 건드리지 않는다 — 그 컬럼은 '처리한 관리자'다.
  // 여기서 admin_id 를 채우면 관리자 목록이 '회원이 직접 반납'을 구분할 수 없게 된다.
  assertEquals(calls.length, 1, "성공 시 재조회가 없어야 한다");
  const update = calls[0];
  assertEquals(update.values, [5, "member-1"]);
  assertEquals(/admin_id/.test(update.text), false, "admin_id 를 수정하면 안 된다");
  assertEquals(/status = 'returned'/.test(update.text), true);
});

Deno.test("returnReservationByMember: SQL 이 본인·대여 중 조건을 모두 건다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    transaction: () => [],
  });

  await returnReservationByMember(db, 5, "member-1");

  const update = calls[0].text;
  // member_id 조건이 빠지면 남의 대여를 반납 처리할 수 있다 (§6.5)
  assertEquals(/member_id = \$2/.test(update), true);
  assertEquals(/status = 'rented'/.test(update), true);
});

Deno.test("returnReservationByMember: 이미 반납된 건은 bad_status", async () => {
  const { db } = stubSql({
    // UPDATE 0행 → 재조회에서 본인 건임을 확인 → 종료 상태
    query: (text) =>
      text.startsWith("UPDATE") ? [] : [{ member_id: "member-1" }],
    transaction: () => [],
  });

  assertEquals(await returnReservationByMember(db, 5, "member-1"), {
    error: "bad_status",
  });
});

Deno.test("returnReservationByMember: 남의 건은 bad_status 가 아니라 not_found", async () => {
  const { db } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [] : [{ member_id: "다른사람" }]),
    transaction: () => [],
  });

  // 타인 건의 존재를 알려주지 않는다 — 404 로 숨긴다
  assertEquals(await returnReservationByMember(db, 5, "member-1"), {
    error: "not_found",
  });
});

Deno.test("returnReservationByMember: 없는 건은 not_found", async () => {
  const { db } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [] : []),
    transaction: () => [],
  });

  assertEquals(await returnReservationByMember(db, 999, "member-1"), {
    error: "not_found",
  });
});

Deno.test("cancelReservation: 반납과 같은 가드(본인 + rented)를 쓴다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    transaction: () => [],
  });

  assertEquals(await cancelReservation(db, 5, "member-1"), { ok: true });
  assertEquals(/status = 'cancelled'/.test(calls[0].text), true);
  assertEquals(/status = 'rented'/.test(calls[0].text), true);
});
