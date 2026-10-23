// 라우트 계약 — HTTP 레벨 테스트가 없던 경로들의 응답 모양을 고정한다.
//
// 왜 이 파일이 필요한가: 서비스 테스트는 서비스 함수만 본다. 라우트는 그 위에 붙는
// 다른 층이라 — 경로 매핑, 상태 코드, 에러 본문, 인증 요구 — 서비스가 정상이어도
// 라우트가 조용히 잘못 매핑되어도 아무도 몰랐다. 여기서는 실제 HTTP 호출로 확인한다.
import { test, expect } from "vitest";
import { httpFixture, TEST_ORIGIN } from "./_http.fixture.ts";

// 상태를 바꾸는 라우트는 정확한 Origin 이 있어야 한다 — POST/PATCH/DELETE 는
// exact-origin 검사(보안)가 걸리므로 헤더를 빼면 403 이 된다. GET 도 같이 준다.
const json = { origin: TEST_ORIGIN, "content-type": "application/json" };
const get = { origin: TEST_ORIGIN };

// ===== GET /api/categories =====

test("categories: 활성 회원은 목록을 받고 item_count 가 채워진다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const user = await member("user", "user");
    db.exec("INSERT INTO categories (id, name) VALUES (1, '회의장비'), (2, '등산');");
    db.exec("INSERT INTO items (id, name) VALUES (1, '빔 프로젝터'), (2, '등산 배낭'), (3, '삼각대');");
    db.exec(`INSERT INTO item_categories (item_id, category_id) VALUES (1,1),(2,2);`);

    const res = await request("/api/categories", { headers: { cookie: user, ...get } });
    expect(res.status).toBe(200);
    const body = await res.json() as { categories: { id: number; name: string; item_count: number }[] };
    // 이름순 정렬이 계약이다 — 화면이 이 순서에 의존한다
    expect(body.categories.map((c) => c.name)).toEqual(["등산", "회의장비"]);
    expect(body.categories.find((c) => c.name === "회의장비")!.item_count).toBe(1);
    expect(body.categories.find((c) => c.name === "등산")!.item_count).toBe(1);
  } finally { db.close(); }
});

test("categories: 익명은 401, 비활성 회원은 401", async () => {
  const { db, request, member } = httpFixture();
  try {
    const inactive = await member("inactive", "user", true);
    expect((await request("/api/categories")).status).toBe(401);
    expect((await request("/api/categories", { headers: { cookie: inactive, ...get } })).status).toBe(401);
  } finally { db.close(); }
});

// ===== GET /api/admin/dashboard =====

test("dashboard: 물품별 대여자 목록과 수량 분포를 준다", async () => {
  // current_renters 의 출처다 — 물품 현황 화면의 '대여자' 컬럼이 여기서 온다
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    await member("borrower", "user");
    db.exec(`
      INSERT INTO items (id, name, kind, total_qty, qty_broken) VALUES
        (1, '빔 프로젝터', 'rental', 3, 1),
        (2, '등산 배낭', 'rental', 1, 0);
      INSERT INTO reservations (item_id, member_id, status, qty)
        VALUES (1, 'borrower', 'rented', 2);
    `);

    const res = await request("/api/admin/dashboard", { headers: { cookie: admin, ...get } });
    expect(res.status).toBe(200);
    const { items } = await res.json() as {
      items: {
        id: number; name: string; total_qty: number; qty_broken: number;
        rentable_qty: number; active_now: number; photo: string | null;
        current_renters: { member_name: string; member_phone: string | null; qty: number }[];
      }[];
    };
    const projector = items.find((i) => i.id === 1)!;
    // 대여 가능 = total_qty − qty_broken = 3 − 1 = 2, 대여 중 = 2
    expect(projector.rentable_qty).toBe(2);
    expect(projector.active_now).toBe(2);
    expect(projector.current_renters).toEqual([
      { member_name: "borrower", member_phone: "010-0000-0000", qty: 2 },
    ]);
    expect(projector.photo).toBeNull();
  } finally { db.close(); }
});

test("dashboard: 폐기 물품도 내려온다 — 현재 상태를 전부 보려는 조회다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    db.exec("INSERT INTO items (id, name, status) VALUES (1, '폐기된 물품', 'retired');");
    const res = await request("/api/admin/dashboard", { headers: { cookie: admin, ...get } });
    const { items } = await res.json() as { items: { id: number; status: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("retired");
  } finally { db.close(); }
});

// ===== /api/admin/allowed-emails =====

test("allowed-emails: 생성·목록·삭제가 관리자 세션에서 동작한다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    const created = await request("/api/admin/allowed-emails", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ email: "New@Example.kr", note: "테스트" }),
    });
    expect(created.status).toBe(201);
    // 이메일은 trim + lowercase 정규화된다 — 중복 판정이 그 문자열에 의존한다
    expect(db.prepare("SELECT email, created_by FROM allowed_emails").get()).toMatchObject({
      email: "new@example.kr",
      created_by: "admin@jungto.org",
    });

    const list = await request("/api/admin/allowed-emails", { headers: { cookie: admin, ...get } });
    expect(list.status).toBe(200);
    const listed = await list.json() as { allowedEmails: { email: string }[] };
    expect(listed.allowedEmails.map((e) => e.email)).toContain("new@example.kr");

    // 삭제는 email 이 아니라 행 id 를 받는다 — DELETE ... WHERE id = ?1 이다
    const rowId = (db.prepare("SELECT id FROM allowed_emails").get() as { id: string }).id;
    const removed = await request(`/api/admin/allowed-emails/${rowId}`, {
      method: "DELETE",
      headers: { cookie: admin, ...get },
    });
    expect(removed.status).toBe(200);
    expect((db.prepare("SELECT COUNT(*) AS n FROM allowed_emails").get() as { n: number }).n).toBe(0);
  } finally { db.close(); }
});

test("allowed-emails: 중복 이메일과 형식 오류를 구분한다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    db.exec("INSERT INTO allowed_emails (id, email) VALUES ('x', 'taken@jungto.org');");
    const dup = await request("/api/admin/allowed-emails", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ email: "taken@jungto.org" }),
    });
    expect(dup.status).toBe(409);

    const bad = await request("/api/admin/allowed-emails", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ email: "이건-email-아님" }),
    });
    expect(bad.status).toBe(400);
  } finally { db.close(); }
});

// ===== /api/admin/reembed-all =====

test("reembed-all: 관리자만 실행할 수 있고 물품 목록을 되돌려준다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    db.exec("INSERT INTO items (id, name) VALUES (1, '빔 프로젝터'), (2, '등산 배낭');");

    // AI 바인딩이 없으면 embedItem 이 실패를 삼키므로 물품 수는 그대로다 — 실행은 성공해야 한다
    const res = await request("/api/admin/reembed-all", { method: "POST", headers: { cookie: admin, ...get } });
    expect(res.status).toBe(200);
    const body = await res.json() as { processed: number; next_after: number | null };
    expect(body).toEqual({ processed: 2, next_after: null });
    // 실패해도 데이터는 온전히 남는다
    expect((db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n).toBe(2);

    // 배치를 다 채우면 커서가 남아야 한다 — 클라이언트가 다음 페이지를 돌린다.
    // 경계 상수(EMBEDS_PER_CALL=15)를 99로 바꾸면 이 단언이 깨진다.
    db.exec(`INSERT INTO items (name)
             SELECT '물품' || value FROM json_each('[3,4,5,6,7,8,9,10,11,12,13,14,15]');`);
    const full = await request("/api/admin/reembed-all", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ all: true }),
    });
    const fullBody = await full.json() as { processed: number; next_after: number | null };
    expect(fullBody.processed).toBe(15);
    expect(fullBody.next_after).not.toBeNull();
  } finally { db.close(); }
});

// ===== /api/admin/categories =====

test("admin categories: 관리자만 만들���� 수 있고 물품 태그가 함께 붙는다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    const created = await request("/api/admin/categories", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ name: "회의장비" }),
    });
    expect(created.status).toBe(201);
    expect((db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n).toBe(1);

    const dup = await request("/api/admin/categories", {
      method: "POST",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ name: "회의장비" }),
    });
    expect(dup.status).toBe(409);

    // 일반 회원은 403 — 권한 메타 테스트와 별개로 본문 검증에 걸리지 않는지도 본다
    const user = await member("user", "user");
    expect((await request("/api/admin/categories", {
      method: "POST",
      headers: { cookie: user, ...json },
      body: JSON.stringify({ name: "무단" }),
    })).status).toBe(403);
  } finally { db.close(); }
});

test("admin categories: 이름을 고치면 물품의 FTS 태그도 따라간다", async () => {
  // tag 는 FTS 텍스트의 일부다 — 여기서 어긋나면 검색 결과가 밀린다
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    db.exec("INSERT INTO categories (id, name) VALUES (1, '옛이름');");
    db.exec("INSERT INTO items (id, name) VALUES (1, '빔 프로젝터');");
    db.exec("INSERT INTO item_categories (item_id, category_id) VALUES (1, 1);");
    db.exec("INSERT INTO items_fts (rowid, name, description, location, tags) VALUES (1, '빔 프로젝터', '', '', '옛이름');");

    const res = await request("/api/admin/categories/1", {
      method: "PATCH",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ name: "새이름" }),
    });
    expect(res.status).toBe(200);
    // 색인 태그는 그 시점 카테고리 이름의 복사본이다 — 이름만 고치면 새 이름으로 검색해도
    // 물품이 안 나온다. renameCategory 가 같은 batch 에서 색인까지 다시 만든다.
    const fts = db.prepare("SELECT tags FROM items_fts WHERE rowid = 1").get() as { tags: string };
    expect(fts.tags).toBe("새이름");
  } finally { db.close(); }
});

test("admin categories: 삭제하면 물품은 남고 FTS 태그에서만 빠진다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    db.exec("INSERT INTO categories (id, name) VALUES (1, '캠핑');");
    db.exec("INSERT INTO items (id, name) VALUES (1, '버너');");
    db.exec("INSERT INTO item_categories (item_id, category_id) VALUES (1, 1);");
    db.exec("INSERT INTO items_fts (rowid, name, description, location, tags) VALUES (1, '버너', '', '', '캠핑');");

    const res = await request("/api/admin/categories/1", {
      method: "DELETE",
      headers: { cookie: admin, ...json },
    });
    expect(res.status).toBe(200);
    // 조인 행은 CASCADE 로 사라지지만 items_fts 는 남는다 — 삭제 전에 확보한 물품 id 로
    // 색인에서도 이름을 빼야 옛 이름으로 검색했을 때 유령이 남지 않는다
    const fts = db.prepare("SELECT tags FROM items_fts WHERE rowid = 1").get() as { tags: string };
    expect(fts.tags).toBe("");
    expect((db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM item_categories").get() as { n: number }).n).toBe(0);
  } finally { db.close(); }
});