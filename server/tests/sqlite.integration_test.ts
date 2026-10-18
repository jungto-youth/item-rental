// 실 SQLite(node:sqlite) 통합 테스트 — 스텁이 흉내낼 수 없는 SQL 동작을 검증한다.
// 스텁 테스트(*.service_test.ts)가 "어떤 SQL을 날리는가"를 단언한다면, 여기선 그 SQL이
// 실제로 무슨 행동을 하는가를 검증한다. 대상:
//   - 대여 가드 INSERT (동시성 안전성의 핵심 — 스텁으로는 절대 검증 못 함)
//   - 마지막 관리자 보호 가드 UPDATE
//   - 물품 등록·수정의 batch 원자성 + items_fts 동기화
// 스키마는 실제 D1 마이그레이션 파일(migrations-d1/)을 그대로 실행해 만든다 —
// 테스트용 DDL 사본이 프로덕션 스키마와 어긋나는 것을 막는다.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "vitest";
import { createReservation, cancelReservation, returnReservation, listReservations } from "../src/services/reservations.service.ts";
import { withdrawMember, setMemberRole } from "../src/services/members.service.ts";
import { createItem, updateItem } from "../src/services/items.service.ts";
import { listItems } from "../src/services/search.service.ts";
import type { Sql } from "../src/db.ts";

// workers-types 의 전역 URL 과 Node 의 url.URL 이 서로 다른 타입이라 href 문자열로 넘긴다
const testsDir = fileURLToPath(new URL("./", import.meta.url).href);
const schema =
  readFileSync(`${testsDir}../../migrations-d1/0001_baseline.sql`, "utf8") +
  "\n" +
  readFileSync(`${testsDir}../../migrations-d1/0002_item_photos_item_id.sql`, "utf8") +
  "\n" + readFileSync(`${testsDir}../../migrations-d1/0003_member_registration_deleted.sql`, "utf8") +
  "\n" +
  readFileSync(`${testsDir}../../migrations-d1/0004_rental_history.sql`, "utf8");

// node:sqlite를 Sql 어댑터로 — db.ts(getDb)와 같은 시그니처. 번호 파라미터(?1)는
// 전달 순서대로 묶인다는 것이 D1 과 같다(본 파일 상단에서 실증).
function sqliteSql(db: DatabaseSync): Sql {
  const run = (sql: string, params: unknown[] = []): Record<string, unknown>[] =>
    db.prepare(sql).all(...(params as SQLInputValue[])) as Record<string, unknown>[];
  return {
    query: <T>(sql: string, params: unknown[] = []) =>
      Promise.resolve(run(sql, params) as T[]),
    batch: async <T>(stmts: { sql: string; params?: unknown[] }[]) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => run(s.sql, s.params ?? []));
        db.exec("COMMIT");
        return out as unknown as T[][];
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  return db;
}

// === 픽스처 헬퍼 ===

let seq = 0;
function addMember(db: DatabaseSync, role: "user" | "admin", deactivated = false) {
  const id = `m${++seq}`;
  db.prepare("INSERT INTO members (id, email, name, role, deactivated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .run(id, `${id}@jungto.org`, `회원${seq}`, role, deactivated ? "2026-01-01T00:00:00.000Z" : null);
  return id;
}

function addItem(db: DatabaseSync, opts: { total_qty?: number; qty_broken?: number; status?: string; kind?: string } = {}) {
  const r = db.prepare(
    `INSERT INTO items (name, status, total_qty, qty_broken, kind)
     VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id`,
  ).all(`물품${++seq}`, opts.status ?? "active", opts.total_qty ?? 2, opts.qty_broken ?? 0, opts.kind ?? "rental");
  return Number((r as unknown as { id: number }[])[0].id);
}

function rent(db: DatabaseSync, itemId: number, memberId: string, qty = 1, status = "rented") {
  db.prepare("INSERT INTO reservations (item_id, member_id, qty, status) VALUES (?1, ?2, ?3, ?4)")
    .run(itemId, memberId, qty, status);
}

const env = {} as never; // embedItem 은 env.AI 부재 실패를 삼킨다 — 등록·수정은 성공해야 한다

// ===== 대여 가드 INSERT =====

test("가드 INSERT: 여유 수량 안이면 대여되고 rented 상태다", async () => {
  const db = freshDb();
  const itemId = addItem(db);
  const memberId = addMember(db, "user");

  const result = await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 1 });

  expect(result).toEqual({ ok: true, id: (result as { id: number }).id });
  const rows = db.prepare("SELECT qty, status FROM reservations").all() as { qty: number; status: string }[];
  expect(rows).toEqual([{ qty: 1, status: "rented" }]);
});

// ===== 대여 이력 보존 (0004_rental_history) =====

test("이력 보존: 대여 시점의 물품명·위치가 스냅샷으로 남는다", async () => {
  const db = freshDb();
  const itemId = addItem(db);
  const memberId = addMember(db, "user");
  db.prepare("UPDATE items SET name = '프로젝터', location = '3층 자료실' WHERE id = ?1").run(itemId);

  await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 1 });

  const row = db
    .prepare("SELECT item_name_snapshot, item_location_snapshot FROM reservations WHERE item_id = ?1")
    .get(itemId) as { item_name_snapshot: string | null; item_location_snapshot: string | null };
  expect(row).toEqual({ item_name_snapshot: "프로젝터", item_location_snapshot: "3층 자료실" });
});

test("이력 보존: 물품이 개명돼도 이미 쌓인 대여 행의 스냅샷은 안 바뀐다", async () => {
  const db = freshDb();
  const itemId = addItem(db);
  const memberId = addMember(db, "user");
  const nameAtRent = (db.prepare("SELECT name FROM items WHERE id = ?1").get(itemId) as { name: string }).name;

  await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 1 });
  db.prepare("UPDATE items SET name = '프로젝터 (Epson EF-12)', location = '4층' WHERE id = ?1").run(itemId);

  // 이력 화면이 읽는 값(스냅샷 우선)은 대여 당시 이름 그대로이고, 현재 값만 바뀌어야 한다
  const list = await listReservations(sqliteSql(db), null);
  expect(list.reservations[0].item_name).toBe(nameAtRent);
  expect(list.reservations[0].item_location_snapshot).toBeNull();

  const [cur] = (await sqliteSql(db).query<{ name: string }>("SELECT name FROM items WHERE id = ?1", [itemId]));
  expect(cur.name).toBe("프로젝터 (Epson EF-12)");
});

test("이력 보존: 반납 시각은 returned_at 에만 담긴다", async () => {
  const db = freshDb();
  const itemId = addItem(db);
  const memberId = addMember(db, "user");
  const adminId = addMember(db, "admin");

  const created = await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 1 });
  const resId = (created as { id: number }).id;
  const sql = sqliteSql(db);
  const read = () => db.prepare("SELECT status, returned_at FROM reservations WHERE id = ?1").get(resId) as
    { status: string; returned_at: string | null };

  expect(read()).toEqual({ status: "rented", returned_at: null });

  expect(await returnReservation(sql, resId, adminId)).toEqual({ ok: true });
  const after = read();
  expect(after.status).toBe("returned");
  expect(after.returned_at).toBeTruthy();
});

test("이력 보존: 취소는 반납이므로 returned_at 이 채워지지 않는다", async () => {
  const db = freshDb();
  const itemId = addItem(db);
  const memberId = addMember(db, "user");

  const created = await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 1 });
  const resId = (created as { id: number }).id;

  expect(await cancelReservation(sqliteSql(db), resId, memberId)).toEqual({ ok: true });
  const after = db.prepare("SELECT status, returned_at FROM reservations WHERE id = ?1").get(resId) as
    { status: string; returned_at: string | null };
  expect(after).toEqual({ status: "cancelled", returned_at: null });
});

test("가드 INSERT: 재고를 넘으면 사전검사 too_many — 행이 남지 않는다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 2 });
  const memberId = addMember(db, "user");

  expect(
    await createReservation(sqliteSql(db), { itemId, memberId, memo: null, qty: 3 }),
  ).toEqual(
    {
      error: "too_many",
      rentable: 2,
    },
  );
  expect(
    (db.prepare("SELECT COUNT(*) n FROM reservations").all() as { n: number }[])[0].n,
  ).toEqual(
    0,
  );
});

test("가드 INSERT: 남은 수량 1을 두 신청이 겹쳐 빌면 두 번째가 거절된다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 1 });
  const a = addMember(db, "user");
  const b = addMember(db, "user");
  const sql = sqliteSql(db);

  // a 의 신청이 성공한 시점에 b 가 같은 재고를 읽고 신청해도, 가드가 INSERT 시점에
  // 다시 세므로 이중 대여가 아닌 no_availability 로 끝난다 — 원자성의 실제 이점
  expect(
    await createReservation(sql, { itemId, memberId: a, memo: null, qty: 1 }).then((r) => "ok" in r),
  ).toEqual(
    true,
  );
  expect(
    await createReservation(sql, { itemId, memberId: b, memo: null, qty: 1 }),
  ).toEqual(
    {
      error: "no_availability",
    },
  );
  const rows = db.prepare("SELECT member_id FROM reservations").all() as { member_id: string }[];
  expect(rows).toEqual([{ member_id: a }]);
});

test("가드 INSERT: 반납·취소된 수량은 점유에서 빠진다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 2 });
  const a = addMember(db, "user");
  const b = addMember(db, "user");
  rent(db, itemId, a, 1, "returned");
  rent(db, itemId, a, 2, "cancelled");

  const result = await createReservation(sqliteSql(db), { itemId, memberId: b, memo: null, qty: 2 });
  expect("ok" in result).toEqual(true);
});

test("가드 INSERT: 수리중(qty_broken) 수량은 빌려줄 재고가 아니다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 3, qty_broken: 2 });
  const memberId = addMember(db, "user");
  const sql = sqliteSql(db);

  expect(
    await createReservation(sql, { itemId, memberId, memo: null, qty: 2 }),
  ).toEqual(
    {
      error: "too_many",
      rentable: 1,
    },
  );
  expect(
    await createReservation(sql, { itemId, memberId, memo: null, qty: 1 }).then((r) => "ok" in r),
  ).toEqual(
    true,
  );
});

test("가드 INSERT: 폐기·수리 물품과 소모품은 상태 코드로 거절된다", async () => {
  const db = freshDb();
  const retired = addItem(db, { status: "retired" });
  const repair = addItem(db, { status: "repair" });
  const consumable = addItem(db, { kind: "consumable" });
  const memberId = addMember(db, "user");
  const sql = sqliteSql(db);

  expect(
    await createReservation(sql, { itemId: retired, memberId, memo: null, qty: 1 }),
  ).toEqual(
    { error: "item_not_active" },
  );
  expect(
    await createReservation(sql, { itemId: repair, memberId, memo: null, qty: 1 }),
  ).toEqual(
    { error: "item_not_active" },
  );
  expect(
    await createReservation(sql, { itemId: consumable, memberId, memo: null, qty: 1 }),
  ).toEqual(
    { error: "consumable" },
  );
});

test("가드 INSERT: 없는 물품은 not_found", async () => {
  const db = freshDb();
  const memberId = addMember(db, "user");
  expect(
    await createReservation(sqliteSql(db), { itemId: 999, memberId, memo: null, qty: 1 }),
  ).toEqual(
    { error: "not_found" },
  );
});

// ===== 마지막 관리자 보호 =====

test("마지막 관리자: 유일한 활성 관리자의 해임·탈퇴는 last_admin으로 거절된다", async () => {
  const db = freshDb();
  const a = addMember(db, "admin");
  const b = addMember(db, "admin", true); // 탈퇴한 관리자 — 개수에서 빠져야 한다 (회귀 대상)
  const sql = sqliteSql(db);

  expect(await setMemberRole(sql, a, "user")).toEqual({ error: "last_admin" });
  expect(await withdrawMember(sql, a)).toEqual({ error: "last_admin" });

  // 해임·탈퇴가 부분 적용되지 않았다 — 원자 거절
  const roles = db.prepare("SELECT id, role, deactivated_at FROM members ORDER BY id").all() as {
    id: string; role: string; deactivated_at: string | null;
  }[];
  expect(
    roles,
  ).toEqual(
    [
      { id: a, role: "admin", deactivated_at: null },
      { id: b, role: "admin", deactivated_at: "2026-01-01T00:00:00.000Z" },
    ],
  );
});

test("마지막 관리자: 관리자 2명이면 해임되고, 그 순간부터 남은 한 명이 보호된다", async () => {
  const db = freshDb();
  const a = addMember(db, "admin");
  const b = addMember(db, "admin");
  const sql = sqliteSql(db);

  expect(await setMemberRole(sql, a, "user")).toEqual({ ok: true });
  expect(await setMemberRole(sql, b, "user")).toEqual({ error: "last_admin" });
});

test("마지막 관리자: 승격과 일반 회원 탈퇴는 개수와 무관하게 통과한다", async () => {
  const db = freshDb();
  const admin = addMember(db, "admin");
  const user = addMember(db, "user");
  const sql = sqliteSql(db);

  expect(await setMemberRole(sql, user, "admin")).toEqual({ ok: true });
  expect(await withdrawMember(sql, user)).toEqual({ ok: true });
  // 탈퇴한 방금 관리자는 활성 수에서 빠진다 — 원래 관리자는 여전히 마지막으로 보호된다
  expect(await setMemberRole(sql, admin, "user")).toEqual({ error: "last_admin" });
});

test("마지막 관리자: 없는 회원은 not_found", async () => {
  const db = freshDb();
  const sql = sqliteSql(db);
  expect(
    await setMemberRole(sql, "ghost", "user"),
  ).toEqual(
    { error: "not_found" },
  );
  expect(await withdrawMember(sql, "ghost")).toEqual({ error: "not_found" });
});

// ===== 물품 등록·수정 — batch 원자성 + FTS 동기화 =====

function ftsRow(db: DatabaseSync, itemId: number) {
  return (db.prepare(
    `SELECT name, description, location, tags FROM items_fts WHERE rowid = ?1`,
  ).all(itemId) as { name: string; description: string; location: string; tags: string }[])[0] ?? null;
}

function categoryRows(db: DatabaseSync, itemId: number) {
  return (db.prepare(
    `SELECT c.name FROM item_categories ic JOIN categories c ON c.id = ic.category_id
      WHERE ic.item_id = ?1 ORDER BY c.name`,
  ).all(itemId) as { name: string }[]).map((r) => r.name);
}

function addCategory(db: DatabaseSync, name: string): number {
  return Number((db.prepare("INSERT INTO categories (name) VALUES (?1) RETURNING id").all(name) as { id: number }[])[0].id);
}

test("createItem: 물품 + 태그 + FTS 행이 한 번에 생긴다 — 태그는 FTS에 공백 조인", async () => {
  const db = freshDb();
  const c1 = addCategory(db, "캠핑");
  const c2 = addCategory(db, "등산");

  const id = await createItem(sqliteSql(db), env, {
    name: "4인용 텐트",
    status: "active",
    total_qty: 2,
    attrs: { location: "A창고", category_ids: [c1, c2] },
  });

  expect(
    ftsRow(db, id),
  ).toEqual(
    {
      name: "4인용 텐트",
      description: "",
      location: "A창고",
      tags: "등산 캠핑", // 이름순 group_concat — embedItem 텍스트 규칙과 동일
    },
  );
  expect(categoryRows(db, id)).toEqual(["등산", "캠핑"]);
});

test("createItem: 존재하지 않는 태그 id면 batch 전체가 롤백된다 — 물품만 남지 않는다", async () => {
  const db = freshDb();
  let threw = false;
  try {
    await createItem(sqliteSql(db), env, {
      name: "고아 물품",
      status: "active",
      total_qty: 1,
      attrs: { category_ids: [9999] },
    });
  } catch {
    threw = true;
  }

  expect(threw).toEqual(true);
  expect(
    (db.prepare("SELECT COUNT(*) n FROM items").all() as { n: number }[])[0].n,
  ).toEqual(
    0,
  );
  expect(
    (db.prepare("SELECT COUNT(*) n FROM item_categories").all() as { n: number }[])[0].n,
  ).toEqual(
    0,
  );
  expect(
    (db.prepare("SELECT COUNT(*) n FROM items_fts").all() as { n: number }[])[0].n,
  ).toEqual(
    0,
  );
});

test("updateItem: 컬럼 + 태그 수정이 반영되고 FTS 도 새 텍스트로 갱신된다", async () => {
  const db = freshDb();
  const c1 = addCategory(db, "캠핑");
  const c2 = addCategory(db, "물놀이");
  const id = await createItem(sqliteSql(db), env, {
    name: "구식 이름",
    status: "active",
    total_qty: 1,
    attrs: { location: "B창고", category_ids: [c1] },
  });

  const result = await updateItem(sqliteSql(db), env, id, {
    name: "신식 이름",
    category_ids: [c2],
  });

  expect(result).toEqual({ ok: true });
  expect(
    ftsRow(db, id),
  ).toEqual(
    {
      name: "신식 이름",
      description: "",
      location: "B창고",
      tags: "물놀이",
    },
  );
  expect(categoryRows(db, id)).toEqual(["물놀이"]);
});

test("updateItem: 태그만 바꿔도 FTS 가 갱신되고, 컬럼은 그대로다", async () => {
  const db = freshDb();
  const c1 = addCategory(db, "캠핑");
  const id = await createItem(sqliteSql(db), env, {
    name: "이름",
    status: "active",
    total_qty: 3,
    attrs: { category_ids: [c1] },
  });
  addCategory(db, "겨울");

  const winter = Number((db.prepare("SELECT id FROM categories WHERE name = '겨울'").all() as { id: number }[])[0].id);
  expect(
    await updateItem(sqliteSql(db), env, id, { category_ids: [winter] }),
  ).toEqual(
    { ok: true },
  );

  expect(ftsRow(db, id)?.tags).toEqual("겨울");
  const item = (db.prepare("SELECT name, total_qty FROM items WHERE id = ?1").all(id) as { name: string; total_qty: number }[])[0];
  expect(item).toEqual({ name: "이름", total_qty: 3 });
});

test("updateItem: 없는 물품 수정은 not_found — 부분 변경이 남지 않는다", async () => {
  const db = freshDb();
  const c1 = addCategory(db, "캠핑");

  expect(
    await updateItem(sqliteSql(db), env, 999, { name: "x", category_ids: [c1] }),
  ).toEqual(
    { error: "not_found" },
  );
  expect(
    (db.prepare("SELECT COUNT(*) n FROM item_categories").all() as { n: number }[])[0].n,
  ).toEqual(
    0,
  );
});

// ===== 보유 수량 감소 가드 =====
// 대여 가능 수량은 total_qty − qty_broken 이므로 이것이 현재 점유량보다 작아지면
// 회수할 수 없는 대여가 생기고 목록에 '대여 가능 -1' 이 찍힌다.

test("가드: 대여 중인 수량 아래로 보유를 줄이면 거부되고 값이 안 바뀐다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 3 });
  const memberId = addMember(db, "user");
  rent(db, itemId, memberId, 2);

  expect(await updateItem(sqliteSql(db), env, itemId, { total_qty: 1 })).toEqual({
    error: "rented_qty_constraint",
  });

  const [row] = db.prepare("SELECT total_qty FROM items WHERE id = ?1").all(itemId) as {
    total_qty: number;
  }[];
  expect(row.total_qty).toBe(3);
});

test("가드: 대여 중인 수량까지 줄이는 것은 허용된다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 3 });
  const memberId = addMember(db, "user");
  rent(db, itemId, memberId, 2);

  // 2개를 빌린 상태에서 보유를 2로 — 전부 나간 상태라 성립한다
  expect(await updateItem(sqliteSql(db), env, itemId, { total_qty: 2 })).toEqual({ ok: true });
  const [row] = db.prepare("SELECT total_qty FROM items WHERE id = ?1").all(itemId) as {
    total_qty: number;
  }[];
  expect(row.total_qty).toBe(2);
});

test("가드: 사전 검사와 UPDATE 사이에 대여가 늘어나도 원자적으로 막는다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 3 });
  const memberId = addMember(db, "user");
  rent(db, itemId, memberId, 1);

  // 사전 검사가 'active_now = 1' 을 읽은 직후 다른 관리자가 남은 수량을 빌려버리는 상황.
  // UPDATE 안의 가드가 조건을 다시 확인하므로 이 값은 저장돼서는 안 된다.
  const base = sqliteSql(db);
  let injected = false;
  const spy = {
    ...base,
    query: async (text: string, params?: unknown[]) => {
      const res = (await base.query(text, params)) as Record<string, unknown>[];
      if (!injected && text.includes("SUM(qty)")) {
        injected = true;
        db.prepare(
          "INSERT INTO reservations (item_id, member_id, qty, status) VALUES (?1, ?2, 2, 'rented')",
        ).run(itemId, memberId);
      }
      return res;
    },
  } as Sql;

  expect(await updateItem(spy, env, itemId, { total_qty: 2 })).toEqual({
    error: "rented_qty_constraint",
  });
  const [row] = db.prepare("SELECT total_qty FROM items WHERE id = ?1").all(itemId) as {
    total_qty: number;
  }[];
  expect(row.total_qty).toBe(3);
});

test("가드: 수량을 건드리지 않는 수정은 대여 검사를 걸지 않는다", async () => {
  const db = freshDb();
  const itemId = addItem(db, { total_qty: 3 });
  const memberId = addMember(db, "user");
  // 이미 잘못된 상태 — 보유 1인데 2개를 빌린 상태를 그대로 둔다
  db.prepare("UPDATE items SET total_qty = 1 WHERE id = ?1").run(itemId);
  rent(db, itemId, memberId, 2);

  expect(await updateItem(sqliteSql(db), env, itemId, { name: "이름만 수정" })).toEqual({
    ok: true,
  });
  const [row] = db.prepare("SELECT name FROM items WHERE id = ?1").all(itemId) as {
    name: string;
  }[];
  expect(row.name).toBe("이름만 수정");
});

test("FTS 스모크: 등록된 물품이 trigram 매치로 검색된다", async () => {
  const db = freshDb();
  await createItem(sqliteSql(db), env, {
    name: "등산용 배낭 40L",
    status: "active",
    total_qty: 1,
    attrs: {},
  });
  await createItem(sqliteSql(db), env, {
    name: "코퉈",
    status: "active",
    total_qty: 1,
    attrs: {},
  });

  // trigram 은 3글자 이상만 매치한다 — 1-2글자는 앱이 LIKE 폴백으로 처리하는 대상
  const hits = (db.prepare("SELECT rowid FROM items_fts WHERE items_fts MATCH ?1").all('"등산용"') as unknown[]).length;
  expect(hits).toEqual(1);
});

// ===== 탐색 목록 (listItems) — 관리자 카테고리 필터·행 카테고리 =====

function tagItem(db: DatabaseSync, itemId: number, categoryId: number) {
  db.prepare("INSERT INTO item_categories (item_id, category_id) VALUES (?1, ?2)").run(itemId, categoryId);
}

test("listItems: withCategories 는 관리자 행에만 카테고리를 채운다", async () => {
  const db = freshDb();
  const sql = sqliteSql(db);
  const catId = addCategory(db, "캠핑");
  const itemId = addItem(db);
  tagItem(db, itemId, catId);

  const admin = await listItems(sql, { limit: 10, offset: 0, available: false, withCategories: true });
  expect(admin.items[0].categories).toEqual([{ id: catId, name: "캠핑" }]);

  const member = await listItems(sql, { limit: 10, offset: 0, available: false });
  expect(member.items[0].categories).toEqual(undefined);
});

test("listItems: 카테고리 필터가 행과 카운트에 함께 적용된다", async () => {
  const db = freshDb();
  const sql = sqliteSql(db);
  const catId = addCategory(db, "사무");
  const tagged = addItem(db);
  const untagged = addItem(db);
  tagItem(db, tagged, catId);
  addItem(db, { status: "retired" }); // 폐기는 필터와 무관하게 항상 제외

  const inCat = await listItems(sql, { limit: 10, offset: 0, available: false, category: String(catId) });
  expect(inCat.items.map((i) => i.id)).toEqual([tagged]);
  expect(inCat.total).toEqual(1);

  const none = await listItems(sql, { limit: 10, offset: 0, available: false, category: "none" });
  expect(none.items.map((i) => i.id)).toEqual([untagged]);
  expect(none.total).toEqual(1);

  const all = await listItems(sql, { limit: 10, offset: 0, available: false });
  expect(all.items.length).toEqual(2);
  expect(all.total).toEqual(2);
});

test("listItems: 카테고리 + 대여가능 필터를 같이 건다", async () => {
  const db = freshDb();
  const sql = sqliteSql(db);
  const catId = addCategory(db, "청소");
  const rentable = addItem(db);
  const broken = addItem(db, { total_qty: 1, qty_broken: 1 });
  tagItem(db, rentable, catId);
  tagItem(db, broken, catId);

  const res = await listItems(sql, {
    limit: 10,
    offset: 0,
    available: true,
    category: String(catId),
    withCategories: true,
  });
  expect(res.items.map((i) => i.id)).toEqual([rentable]);
  expect(res.available_total).toEqual(1);
});

test("listItems: includeRetired 는 폐기 물품을 행과 카운트에 포함한다", async () => {
  const db = freshDb();
  const sql = sqliteSql(db);
  const active = addItem(db);
  const retired = addItem(db, { status: "retired" });

  const base = await listItems(sql, { limit: 10, offset: 0, available: false });
  expect(base.items.map((i) => i.id)).toEqual([active]);
  expect(base.total).toEqual(1);

  // ORDER BY id DESC — 나중에 등록된(폐기) 물품이 먼저 온다
  const all = await listItems(sql, {
    limit: 10,
    offset: 0,
    available: false,
    includeRetired: true,
  });
  expect(all.items.map((i) => i.id)).toEqual([retired, active]);
  expect(all.total).toEqual(2);
});
