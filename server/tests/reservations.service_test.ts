// 대여 서비스 단위 테스트 — DB 없이 돌아간다 (Sql 스텁)
// 회귀 대상: createReservation 이 RETURNING 0행을 성공으로 오인하지 않고,
// 한 신청을 pending/reserved 두 세그먼트로 나누는 단일 INSERT 가드를 유지하는지 본다.
/// <reference types="@cloudflare/workers-types" />
import { test, expect } from "vitest";
import {
  createReservation,
  validateReservation,
  cancelReservation,
  returnReservationByMember,
  approveReservation,
  rejectReservation,
  type CreateReservationParams,
  type ReserveItem,
} from "../src/services/reservations.service.ts";
import { stubSql } from "./_stub.ts";

// 대여 가능한 물품 (재고 2, 수리중 0)
const RENTAL_ITEM: ReserveItem = {
  id: 1,
  lifecycle: "active",
  kind: "rental",
  total_qty: 2,
  qty_repair: 0,
  rented_qty: 0,
  pending_qty: 0,
  reserved_qty: 0,
};

function params(overrides: Partial<CreateReservationParams> = {}): CreateReservationParams {
  return {
    itemId: 1,
    memberId: "member-1",
    memo: null,
    qty: 1,
    dueAt: "2026-11-10T14:59:59.999Z",
    ...overrides,
  };
}

// ===== 신청 INSERT 원자성 =====

// createReservation 의 query 스크립트 — INSERT(WITH p AS)와 사전/재조회 SELECT를 구분한다.
function createQuery(
  insertRows: Record<string, unknown>[],
): (text: string) => Record<string, unknown>[] {
  return (text) => {
    if (text.startsWith("WITH p AS")) return insertRows;
    if (text.includes("FROM items")) {
      return [RENTAL_ITEM as unknown as Record<string, unknown>];
    }
    return [];
  };
}

test("createReservation: 가드 INSERT가 0행이면 성공으로 오인하지 않는다", async () => {
  const { db } = stubSql({ query: createQuery([]), batch: () => [] });

  const result = await createReservation(db, params());

  expect(result).toEqual({ error: "no_availability" });
  expect(!("ok" in result), "성공으로 오인하면 안 된다").toBe(true);
});

test("createReservation: 단일 INSERT가 group_id와 세그먼트를 돌려준다", async () => {
  let insertSql = "";
  let insertParams: unknown[] = [];
  const { db } = stubSql({
    query: (text, values) => {
      if (text.startsWith("WITH p AS")) {
        insertSql = text;
        insertParams = values;
        return [{ id: 42, status: "pending", qty: 1 }];
      }
      return [RENTAL_ITEM as unknown as Record<string, unknown>];
    },
    batch: () => [],
  });

  const result = await createReservation(db, params());

  expect("ok" in result).toBe(true);
  if (!("ok" in result)) return;
  expect(result.segments).toEqual([{ id: 42, status: "pending", qty: 1 }]);
  expect(result.group_id).toMatch(/^[0-9a-f-]{36}$/);
  // group_id 는 INSERT 의 6번째 바인딩이다
  expect(insertParams[5]).toBe(result.group_id);
  // 한 문장 안에서 pending/reserved 두 분기를 만든다
  expect(insertSql).toMatch(/UNION ALL/);
  expect(insertSql).toMatch(/'pending'/);
  expect(insertSql).toMatch(/'reserved'/);
});

test("createReservation: 가드는 rented/pending/reserved 세 영역을 모두 센다", async () => {
  let insertSql = "";
  const { db } = stubSql({
    query: (text) => {
      if (text.startsWith("WITH p AS")) {
        insertSql = text;
        return [{ id: 7, status: "pending", qty: 1 }];
      }
      return [RENTAL_ITEM as unknown as Record<string, unknown>];
    },
    batch: () => [],
  });

  await createReservation(db, params());

  expect(insertSql).toMatch(/status = 'rented'/);
  expect(insertSql).toMatch(/status = 'pending'/);
  expect(insertSql).toMatch(/status = 'reserved'/);
  expect(insertSql).toMatch(/MAX\(0, r - rented - pending - reserved\)/);
  expect(insertSql).toMatch(/MAX\(0, r - reserved\)/);
  // 옛 일별 점유 검사·날짜 컬럼이 남아 있으면 안 된다
  expect(!/generate_series/.test(insertSql)).toBe(true);
  expect(!/start_date|end_date/.test(insertSql)).toBe(true);
});

test("createReservation: 부족분은 reserved 세그먼트로 돌려준다", async () => {
  const { db } = stubSql({
    query: createQuery([
      { id: 1, status: "pending", qty: 1 },
      { id: 2, status: "reserved", qty: 1 },
    ]),
    batch: () => [],
  });

  const result = await createReservation(db, params({ qty: 2 }));

  expect(result).toMatchObject({
    ok: true,
    segments: [
      { id: 1, status: "pending", qty: 1 },
      { id: 2, status: "reserved", qty: 1 },
    ],
  });
});

// ===== 실패 신호 구분 =====

test("createReservation: 물품이 없으면 INSERT를 실행하지 않는다", async () => {
  const { db, calls } = stubSql({ query: () => [], batch: () => [] });

  const result = await createReservation(db, params());

  expect(result).toEqual({ error: "not_found" });
  expect(calls.length).toEqual(1);
  expect(calls.every((call) => !call.text.startsWith("WITH p AS"))).toEqual(true);
});

test("createReservation: 신청 사이 물품 삭제(FK 위반)는 not_found", async () => {
  const { db } = stubSql({
    query: (text) => {
      if (text.startsWith("WITH p AS")) {
        throw new Error("FOREIGN KEY constraint failed");
      }
      return [RENTAL_ITEM as unknown as Record<string, unknown>];
    },
    batch: () => [],
  });

  expect(await createReservation(db, params())).toEqual({ error: "not_found" });
});

test("createReservation: 알 수 없는 DB 오류는 삼키지 않고 던진다", async () => {
  const { db } = stubSql({
    query: (text) => {
      if (text.startsWith("WITH p AS")) throw new Error("boom");
      return [RENTAL_ITEM as unknown as Record<string, unknown>];
    },
    batch: () => [],
  });

  // Vitest 의 toThrow 는 인자를 하나만 받는다 — Error 타입과 메시지를 따로 단언
  const thrown = await createReservation(db, params()).catch((e: unknown) => e);
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain("boom");
});

// ===== validateReservation (순수 함수) =====

test("validateReservation: 통과 — 재고 2 중 1개", () => {
  expect(validateReservation(RENTAL_ITEM, { qty: 1 })).toEqual({ ok: true });
});

test("validateReservation: 수리중을 뺀 재고로 수량을 본다", () => {
  const broken: ReserveItem = { ...RENTAL_ITEM, total_qty: 5, qty_repair: 3 };
  expect(validateReservation(broken, { qty: 2 })).toEqual({ ok: true });
  expect(
    validateReservation(broken, { qty: 3 }),
  ).toEqual(
    {
      error: "too_many",
      rentable: 2,
    },
  );
});

test("validateReservation: 대기열이 가득 차면 queue_full", () => {
  const full: ReserveItem = { ...RENTAL_ITEM, reserved_qty: 2 };
  expect(validateReservation(full, { qty: 1 })).toEqual({
    error: "queue_full",
    max_request: 0,
    rentable: 2,
  });
});

test("validateReservation: rented/pending은 신규 배정에서 빼고 reserved는 예약 자리만 남긴다", () => {
  // R=2, rented=1, pending=1 → 지금 0, 예약 자리는 2
  const busy: ReserveItem = { ...RENTAL_ITEM, rented_qty: 1, pending_qty: 1 };
  expect(validateReservation(busy, { qty: 1 })).toEqual({ ok: true });

  // R=2, reserved=1 → 지금 1, 예약 자리 1 → 최대 2
  const waiting: ReserveItem = { ...RENTAL_ITEM, reserved_qty: 1 };
  expect(validateReservation(waiting, { qty: 2 })).toEqual({ ok: true });
  expect(validateReservation(waiting, { qty: 3 })).toEqual({
    error: "too_many",
    rentable: 2,
  });
});

test("validateReservation: 비활성 물품·소모품을 거른다", () => {
  expect(
    validateReservation({ ...RENTAL_ITEM, lifecycle: "retired" }, { qty: 1 }),
  ).toEqual(
    { error: "item_not_active" },
  );
  expect(
    validateReservation({ ...RENTAL_ITEM, kind: "consumable" }, { qty: 1 }),
  ).toEqual(
    { error: "consumable" },
  );
});

// ===== 본인 반납·취소 (ownAction) =====
// 반납은 관리자와 회원이 모두 할 수 있다. 회원 경로의 안전 조건은
// "본인 + 대여 중(rented)" 두 가지이고, 어긋나면 404/409 로 갈린다.

test("returnReservationByMember: 본인 + 대여 중이면 성공한다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    batch: () => [],
  });

  const result = await returnReservationByMember(db, 5, "member-1");

  expect(result).toEqual({ ok: true });
  // 회원 경로는 admin_id 를 건드리지 않는다 — 그 컬럼은 '처리한 관리자'다.
  // 여기서 admin_id 를 채우면 관리자 목록이 '회원이 직접 반납'을 구분할 수 없게 된다.
  expect(calls.length, "성공 시 재조회가 없어야 한다").toEqual(1);
  const update = calls[0];
  expect(update.values).toEqual([5, "member-1"]);
  expect(/admin_id/.test(update.text), "admin_id 를 수정하면 안 된다").toEqual(false);
  expect(/status = 'returned'/.test(update.text)).toEqual(true);
});

test("returnReservationByMember: SQL 이 본인·대여 중 조건을 모두 건다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    batch: () => [],
  });

  await returnReservationByMember(db, 5, "member-1");

  const update = calls[0].text;
  // member_id 조건이 빠지면 남의 대여를 반납 처리할 수 있다 ()
  expect(/member_id = \?2/.test(update)).toEqual(true);
  expect(/status = 'rented'/.test(update)).toEqual(true);
});

test("returnReservationByMember: 이미 반납된 건은 bad_status", async () => {
  const { db } = stubSql({
    // UPDATE 0행 → 재조회에서 본인 건임을 확인 → 종료 상태
    query: (text) =>
      text.startsWith("UPDATE") ? [] : [{ member_id: "member-1" }],
    batch: () => [],
  });

  expect(
    await returnReservationByMember(db, 5, "member-1"),
  ).toEqual(
    {
      error: "bad_status",
    },
  );
});

test("returnReservationByMember: 남의 건은 bad_status 가 아니라 not_found", async () => {
  const { db } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [] : [{ member_id: "다른사람" }]),
    batch: () => [],
  });

  // 타인 건의 존재를 알려주지 않는다 — 404 로 숨긴다
  expect(
    await returnReservationByMember(db, 5, "member-1"),
  ).toEqual(
    {
      error: "not_found",
    },
  );
});

test("returnReservationByMember: 없는 건은 not_found", async () => {
  const { db } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [] : []),
    batch: () => [],
  });

  expect(
    await returnReservationByMember(db, 999, "member-1"),
  ).toEqual(
    {
      error: "not_found",
    },
  );
});

test("cancelReservation: 본인 + pending/reserved/rented 건을 취소할 수 있다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    batch: () => [],
  });

  expect(await cancelReservation(db, 5, "member-1")).toEqual({ ok: true });
  expect(/status = 'cancelled'/.test(calls[0].text)).toEqual(true);
  expect(/status IN \('pending', 'reserved', 'rented'\)/.test(calls[0].text)).toEqual(true);
  expect(/member_id = \?2/.test(calls[0].text)).toEqual(true);
});

// ===== 승인·거절 (B-10) =====

test("approveReservation: pending 승인은 상태·재고·반납일을 한 문장으로 건다", async () => {
  const { db, calls } = stubSql({
    query: (text) => {
      if (text.startsWith("SELECT status, item_id, due_at")) {
        return [{ status: "pending", item_id: 1, due_at: "2099-01-01T00:00:00.000Z" }];
      }
      if (text.startsWith("UPDATE")) return [{ id: 5 }];
      return [];
    },
    batch: () => [],
  });

  expect(await approveReservation(db, 5, "admin-1")).toEqual({ ok: true });
  const update = calls.find((call) => call.text.startsWith("UPDATE"))!;
  expect(/status IN \('pending', 'reserved'\)/.test(update.text)).toEqual(true);
  expect(/status = 'rented'/.test(update.text)).toEqual(true);
  expect(/SUM\(r\.qty\)/.test(update.text)).toEqual(true);
  expect(/due_at = \?3/.test(update.text)).toEqual(true);
  expect(update.values).toEqual([5, "admin-1", "2099-01-01T00:00:00.000Z"]);
});

test("approveReservation: 0행이면 재조회로 bad_status·no_availability 를 가른다", async () => {
  // 이미 반납된 건
  const returned = stubSql({
    query: (text) =>
      text.startsWith("SELECT status, item_id, due_at")
        ? [{ status: "returned", item_id: 1, due_at: null }]
        : [],
    batch: () => [],
  });
  expect(await approveReservation(returned.db, 5, "admin-1")).toEqual({
    error: "bad_status",
  });

  // pending 이지만 재고가 없다
  const noStock = stubSql({
    query: (text) => {
      if (text.startsWith("SELECT status, item_id, due_at")) {
        return [{ status: "pending", item_id: 1, due_at: "2099-01-01T00:00:00.000Z" }];
      }
      if (text.startsWith("UPDATE")) return [];
      if (text.startsWith("SELECT status, item_id FROM")) {
        return [{ status: "pending", item_id: 1 }];
      }
      if (text.includes("FROM items")) {
        return [{ lifecycle: "active", kind: "rental" }];
      }
      return [];
    },
    batch: () => [],
  });
  expect(await approveReservation(noStock.db, 5, "admin-1")).toEqual({
    error: "no_availability",
  });
});

test("approveReservation: 희망일이 지난 pending 은 새 날짜가 필요하다", async () => {
  const { db } = stubSql({
    query: (text) =>
      text.startsWith("SELECT status, item_id, due_at")
        ? [{ status: "pending", item_id: 1, due_at: "2000-01-01T00:00:00.000Z" }]
        : [],
    batch: () => [],
  });
  expect(await approveReservation(db, 5, "admin-1")).toEqual({
    error: "due_date_required",
  });
});

test("approveReservation: reserved 승인은 재고를 확인하고 기본 반납일을 채운다", async () => {
  const { db, calls } = stubSql({
    query: (text) => {
      if (text.startsWith("SELECT status, item_id, due_at")) {
        return [{ status: "reserved", item_id: 1, due_at: null }];
      }
      if (text.startsWith("UPDATE")) return [{ id: 5 }];
      return [];
    },
    batch: () => [],
  });

  expect(await approveReservation(db, 5, "admin-1")).toEqual({ ok: true });
  const update = calls.find((call) => call.text.startsWith("UPDATE"))!;
  // reserved 가드는 rented + pending 까지 더한다
  expect(/status IN \('rented', 'pending'\)/.test(update.text)).toEqual(true);
  const dueAt = update.values[2] as string;
  expect(dueAt > new Date().toISOString()).toEqual(true);
});

test("approveReservation: 관리자가 지정한 반납일을 우선한다", async () => {
  const override = "2099-12-31T14:59:59.999Z";
  const { db, calls } = stubSql({
    query: (text) => {
      if (text.startsWith("SELECT status, item_id, due_at")) {
        return [{ status: "reserved", item_id: 1, due_at: null }];
      }
      if (text.startsWith("UPDATE")) return [{ id: 5 }];
      return [];
    },
    batch: () => [],
  });

  expect(await approveReservation(db, 5, "admin-1", override)).toEqual({ ok: true });
  const update = calls.find((call) => call.text.startsWith("UPDATE"))!;
  expect(update.values[2]).toEqual(override);
});

test("rejectReservation: 사유가 필수이고 pending/reserved 를 거절한다", async () => {
  const empty = stubSql({ query: () => [], batch: () => [] });
  expect(await rejectReservation(empty.db, 5, "admin-1", "   ")).toEqual({
    error: "reason_required",
  });

  const ok = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [{ id: 5 }] : []),
    batch: () => [],
  });
  expect(await rejectReservation(ok.db, 5, "admin-1", "재고 없음")).toEqual({
    ok: true,
  });
  expect(/status = 'rejected'/.test(ok.calls[0].text)).toEqual(true);
  expect(/status IN \('pending', 'reserved'\)/.test(ok.calls[0].text)).toEqual(true);
  expect(ok.calls[0].values).toEqual([5, "admin-1", "재고 없음"]);

  const bad = stubSql({
    query: (text) => (text.startsWith("UPDATE") ? [] : [{ id: 5 }]),
    batch: () => [],
  });
  expect(await rejectReservation(bad.db, 5, "admin-1", "사유")).toEqual({
    error: "bad_status",
  });
});
