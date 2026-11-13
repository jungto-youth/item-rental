// 웹 앱 스모크 테스트 — 실제 페이지를 고정 fixture 로 렌더하고
// 화면 진입·핵심 상호작용·콘솔 오류를 확인한다.
//   node web/tests/smoke.browser.test.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const screenshotDir = fileURLToPath(
  new URL("./visual/current/", import.meta.url),
);

const MEMBER = {
  id: "member",
  email: "member@example.invalid",
  name: "김하늘",
  phone: "010-0000-0000",
  affiliation: "청년지부 · 서울 · 동부",
  role: "user",
  deactivated_at: null,
};

const ADMIN = {
  id: "admin",
  email: "admin@example.invalid",
  name: "김운영",
  phone: "010-0000-0000",
  affiliation: "청년지부 · 서울 · 동부",
  role: "admin",
  deactivated_at: null,
};

const ITEMS = [
  {
    id: 101,
    name: "4인용 텐트",
    lifecycle: "active",
    total_qty: 5,
    qty_repair: 1,
    rentable_qty: 4,
    kind: "rental",
    location: "7층 비품실",
    description: "바닥재와 팩이 함께 들어 있습니다.",
    photos: [],
    availability_badge: "available",
    active_now: 1,
    categories: [{ id: 1, name: "캠핑" }],
  },
  {
    id: 102,
    name: "주차콘",
    lifecycle: "active",
    total_qty: 10,
    qty_repair: 0,
    rentable_qty: 10,
    kind: "rental",
    location: "2층 OA실",
    photos: [],
    availability_badge: "available",
    active_now: 0,
    categories: [{ id: 2, name: "행사" }],
  },
  {
    id: 103,
    name: "선풍기",
    lifecycle: "active",
    total_qty: 2,
    qty_repair: 2,
    rentable_qty: 0,
    kind: "rental",
    location: "2층 OA실",
    photos: [],
    availability_badge: "repair",
    active_now: 0,
    categories: [{ id: 3, name: "사무" }],
  },
  {
    // 지금은 전부 대여 중이라 예약만 가능한 물품 — "예약 가능" 탭/폼 검증용
    id: 104,
    name: "무선 마이크",
    lifecycle: "active",
    total_qty: 2,
    qty_repair: 0,
    rentable_qty: 2,
    kind: "rental",
    location: "3층 음향실",
    photos: [],
    availability_badge: "reserved",
    active_now: 2,
    categories: [{ id: 4, name: "음향" }],
  },
];

// 0012 — 상세/카드가 읽는 재고 3영역. 픽스처는 기본 0으로 둔다.
for (const item of ITEMS) {
  item.pending_qty ??= 0;
  item.reserved_qty ??= 0;
}

const RESERVATIONS = [
  {
    id: 1,
    item_id: 101,
    item_name: "4인용 텐트",
    item_photo: null,
    qty: 1,
    status: "rented",
    member_memo: "10/30 청년 모임",
    created_at: "2026-10-28T03:00:00.000Z",
    updated_at: "2026-10-28T03:00:00.000Z",
    due_at: "2026-11-05T14:59:59.999Z",
    is_overdue: false,
    decided_at: "2026-10-28T04:00:00.000Z",
    rejected_reason: null,
  },
  {
    id: 2,
    item_id: 102,
    item_name: "주차콘",
    item_photo: null,
    qty: 2,
    status: "returned",
    member_memo: null,
    created_at: "2026-10-20T03:00:00.000Z",
    updated_at: "2026-10-22T03:00:00.000Z",
    due_at: null,
    is_overdue: false,
    decided_at: null,
    rejected_reason: null,
  },
  {
    id: 3,
    item_id: 103,
    item_name: "선풍기",
    item_photo: null,
    qty: 1,
    status: "rented",
    member_memo: "사무실 사용",
    created_at: "2026-10-01T03:00:00.000Z",
    updated_at: "2026-10-01T03:00:00.000Z",
    due_at: "2026-10-10T14:59:59.999Z",
    is_overdue: true,
    decided_at: "2026-10-01T04:00:00.000Z",
    rejected_reason: null,
  },
  {
    id: 4,
    item_id: 101,
    item_name: "4인용 텐트",
    item_photo: null,
    qty: 1,
    status: "pending",
    member_memo: "주말 캠핑",
    created_at: "2026-11-02T03:00:00.000Z",
    updated_at: "2026-11-02T03:00:00.000Z",
    due_at: "2026-11-12T14:59:59.999Z",
    is_overdue: false,
    decided_at: null,
    rejected_reason: null,
  },
  {
    id: 5,
    item_id: 102,
    item_name: "주차콘",
    item_photo: null,
    qty: 1,
    status: "rejected",
    member_memo: "행사용",
    created_at: "2026-10-30T03:00:00.000Z",
    updated_at: "2026-10-31T03:00:00.000Z",
    due_at: null,
    is_overdue: false,
    decided_at: "2026-10-31T03:00:00.000Z",
    rejected_reason: "해당 기간에 이미 대여가 잡혀 있습니다",
  },
  {
    id: 6,
    item_id: 104,
    item_name: "무선 마이크",
    item_photo: null,
    qty: 2,
    status: "reserved",
    member_memo: "행사용",
    created_at: "2026-11-03T03:00:00.000Z",
    updated_at: "2026-11-03T03:00:00.000Z",
    due_at: null,
    is_overdue: false,
    decided_at: null,
    rejected_reason: null,
    queue_ahead_qty: 2,
  },
];

// 반납 사진 계약 — 서버는 사진이 없어도 항상 배열을 내려준다.
for (const row of RESERVATIONS) {
  row.return_photos = [];
  row.group_id ??= null;
  row.queue_ahead_qty ??= 0;
}

const ADMIN_RESERVATIONS = RESERVATIONS.map((row, index) => ({
  ...row,
  total_qty: 5,
  item_rentable_qty: 5,
  item_rented_qty: 1,
  item_pending_qty: row.status === "pending" ? 1 : 0,
  item_reserved_qty: row.status === "reserved" ? row.qty : 0,
  approvable: row.status === "pending" || row.status === "reserved",
  queue_ahead_qty: row.status === "reserved" ? row.queue_ahead_qty ?? 0 : 0,
  member_id: `member-${index}`,
  member_name: "김하늘",
  member_email: "member@example.invalid",
  member_phone: "010-0000-0000",
  member_affiliation: "서울지부",
  member_affiliation_snapshot: "서울지부",
  admin_name: row.status === "returned" ? "김운영" : null,
  decided_by_name:
    row.status === "pending" ? null : "김운영",
  returned_by_member: false,
  item_name_snapshot: row.item_name,
  item_location_snapshot: "7층 비품실",
  returned_at: row.status === "returned" ? row.updated_at : null,
  admin_memo: null,
}));

let members = [
  {
    ...ADMIN,
    created_at: "2026-01-01",
    active_rental_count: 0,
  },
  {
    ...MEMBER,
    created_at: "2026-02-01",
    active_rental_count: 0,
  },
  {
    id: "busy",
    name: "대여 중 회원",
    email: "busy@example.invalid",
    phone: null,
    role: "user",
    deactivated_at: "2026-01-01",
    created_at: "2026-01-01",
    active_rental_count: 1,
  },
  {
    id: "ready",
    name: "정리 회원",
    email: "ready@example.invalid",
    phone: null,
    role: "user",
    deactivated_at: "2026-01-01",
    created_at: "2026-01-01",
    active_rental_count: 0,
  },
  // 긴 이름·이메일·소속 — 모바일에서 카드가 화면 밖으로 밀려나는지 검사한다.
  {
    id: "long",
    name: "아주아주아주긴이름의회원",
    email: "very.long.email.address.for.testing.overflow@example.invalid",
    phone: "010-1234-5678",
    affiliation: "아주 긴 소속 이름을 가진 부서입니다 정말로",
    role: "user",
    deactivated_at: null,
    created_at: "2026-01-01",
    active_rental_count: 0,
  },
];

async function mockApi(page, user, options = {}) {
  await page.route("**/api/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/dev/login", (route) =>
    route.fulfill({
      json: options.devLogin
        ? { enabled: true, configured: true }
        : { enabled: false },
    }),
  );
  await page.route("**/api/items**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/items") {
      const q = url.searchParams.get("q");
      const state = url.searchParams.get("state");
      const newCap = (item) =>
        Math.max(
          0,
          (item.rentable_qty ?? 0) -
            (item.active_now ?? 0) -
            (item.pending_qty ?? 0) -
            (item.reserved_qty ?? 0),
        );
      const queueCap = (item) =>
        Math.max(0, (item.rentable_qty ?? 0) - (item.reserved_qty ?? 0));
      let items = ITEMS;
      if (state === "available") {
        items = items.filter(
          (item) => item.kind !== "consumable" && newCap(item) > 0,
        );
      } else if (state === "reserved") {
        items = items.filter(
          (item) =>
            item.kind !== "consumable" &&
            newCap(item) === 0 &&
            queueCap(item) > 0,
        );
      } else if (state === "rented") {
        items = items.filter((item) => (item.active_now ?? 0) > 0);
      } else if (state === "repair") {
        items = items.filter((item) => (item.qty_repair ?? 0) > 0);
      }
      if (q) items = items.filter((item) => item.name.includes(q));
      return route.fulfill({
        json: {
          items,
          total: ITEMS.length,
          matched: items.length,
          summary: { types: 4, available: 2, rented: 2, repair: 1 },
          hasMore: false,
        },
      });
    }
    const id = Number(url.pathname.split("/").pop());
    const item = ITEMS.find((entry) => entry.id === id) ?? ITEMS[0];
    return route.fulfill({ json: { item } });
  });
  await page.route("**/api/categories", (route) =>
    route.fulfill({
      json: { categories: [{ id: 1, name: "캠핑", item_count: 1 }] },
    }),
  );
  await page.route("**/api/reservations", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      // 예약 전용 물품(104)은 전량 reserved 로 응답한다.
      if (body?.item_id === 104) {
        return route.fulfill({
          json: {
            group_id: "test-group",
            segments: [
              { id: 2, status: "reserved", qty: body?.qty ?? 1 },
            ],
          },
        });
      }
      return route.fulfill({
        json: {
          group_id: "test-group",
          segments: [{ id: 1, status: "pending", qty: body?.qty ?? 1 }],
        },
      });
    }
    return route.fallback();
  });
  await page.route("**/api/reservations/mine", (route) =>
    route.fulfill({ json: { reservations: RESERVATIONS } }),
  );
  if (user?.role === "admin") {
    await page.route("**/api/admin/members**", async (route) => {
      if (route.request().method() === "DELETE") {
        const id = route.request().url().split("/").pop();
        members = members.filter((member) => member.id !== id);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { members } });
    });
    await page.route("**/api/admin/allowed-emails**", (route) =>
      route.fulfill({ json: { allowedEmails: [] } }),
    );
    await page.route("**/api/admin/reservations**", (route) =>
      route.fulfill({ json: { reservations: ADMIN_RESERVATIONS, truncated: false } }),
    );
    await page.route("**/api/admin/items**", (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 4) {
        return route.fulfill({
          json: {
            item: {
              ...ITEMS[0],
              categories: [{ id: 1, name: "캠핑" }],
            },
          },
        });
      }
      return route.fulfill({
        json: { items: ITEMS, total: ITEMS.length, hasMore: false },
      });
    });
  }
}

const SCREENS = [
  { name: "home", path: "/", user: MEMBER, ready: ".item-card" },
  { name: "detail", path: "/items/101", user: MEMBER, ready: ".item-rental-form" },
  { name: "login", path: "/login", user: null, ready: ".page-login" },
  { name: "signup-profile", path: "/signup/profile", user: MEMBER, ready: ".profile-form" },
  { name: "mypage", path: "/mypage", user: MEMBER, ready: ".page-mypage .card" },
  { name: "my-rentals", path: "/my/rentals", user: MEMBER, ready: ".reservation-row" },
  { name: "admin-reservations", path: "/admin/reservations", user: ADMIN, ready: ".reservation-row" },
  { name: "admin-members", path: "/admin/members", user: ADMIN, ready: ".member" },
  { name: "item-form", path: "/items/new", user: ADMIN, ready: ".admin-page form" },
  { name: "design", path: "/design", user: MEMBER, ready: "#foundation" },
  { name: "policy", path: "/policy/privacy", user: MEMBER, ready: "article" },
  { name: "not-found", path: "/nope", user: MEMBER, ready: ".page-not-found" },
];

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const base = server.resolvedUrls.local[0];

  // 1) 로그인하지 않으면 보호 화면은 /login 으로 먼저 이동한다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await mockApi(page, null);
    await page.goto(new URL("/", base).href);
    await page.waitForURL(base + "login");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("PASS anonymous home redirects to login");
  }

  // 1-1) 필수 프로필(연락처·지회·모둠)이 없으면 로그인 후 프로필 등록으로 이동한다.
  for (const [label, user, path] of [
    ["member without phone", { ...MEMBER, phone: null }, "/"],
    ["admin without phone", { ...ADMIN, phone: null }, "/admin/members"],
    // 기존 자유 입력 소속은 유효한 지회·모둠 조합이 아니다 — 다시 선택하게 한다
    ["member with legacy affiliation", { ...MEMBER, affiliation: "서울지부" }, "/mypage"],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await mockApi(page, user);
    await page.goto(new URL(path.replace(/^\//, ""), base).href);
    await page.waitForURL(base + "signup/profile");
    await page.locator(".profile-form").waitFor();
    assert.deepEqual(errors, [], `${label} console errors`);
    await context.close();
    console.log(`PASS ${label} redirects to profile`);
  }

  // 2) 모든 화면이 렌더되고 콘솔 오류가 없다.
  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await mockApi(page, screen.user);
    for (const width of [390, 1280]) {
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : 900,
      });
      await page.goto(new URL(screen.path.replace(/^\//, ""), base).href, {
        waitUntil: "networkidle",
      });
      await page.locator(screen.ready).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(screenshotDir, `${screen.name}-${width}.png`),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, [], `${screen.name} console errors`);
    console.log(`PASS ${screen.name}`);
    await context.close();
  }

  // 3) 상세에서 대여하면 성공 상태가 보인다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("items/101", base).href);
    await page.getByLabel("메모 *").fill("청년 모임용");
    await page.getByRole("button", { name: "대여하기", exact: true }).click();
    await page.getByText("대여를 신청했습니다", { exact: true }).waitFor();
    console.log("PASS rental success state");
    await context.close();
  }

  // 3-1) 재고가 모두 나간 물품은 예약으로 접수되고, 성공 화면이 분해 결과를 보여준다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("items/104", base).href);
    await page.getByText(/지금 대여 신청\s*0개/).waitFor();
    await page.getByRole("button", { name: "수량 증가" }).click();
    await page.getByText(/반납 대기 예약\s*2개/).waitFor();
    await page.getByLabel("메모 *").fill("행사용");
    await page.getByRole("button", { name: "예약하기", exact: true }).click();
    await page.getByText("예약을 접수했습니다", { exact: true }).waitFor();
    console.log("PASS reservation success state");
    await context.close();
  }

  // 3-2) "예약 가능" 탭은 지금은 없지만 대기열 자리가 있는 물품만 보여준다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(base);
    await page.getByRole("button", { name: "예약 가능", exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".item-card").count(), 1);
    await page.getByText("무선 마이크", { exact: true }).waitFor();
    console.log("PASS reserved tab");
    await context.close();
  }

  // 4) 검색과 상태 필터가 목록을 좁힌다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(base);
    await page.getByLabel("물품 검색").fill("텐트");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".item-card").count(), 1);
    await page.getByLabel("물품 검색").fill("");
    await page.getByRole("button", { name: "수리 중", exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".item-card").count(), 2);
    console.log("PASS search and status filter");
    await context.close();
  }

  // 5) 정책 탭 전환.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("policy/privacy", base).href);
    await page.getByRole("navigation", { name: "정책 문서" }).getByRole("link", { name: "이용약관", exact: true }).click();
    await page.getByRole("heading", { name: "이용약관", exact: true }).waitFor();
    console.log("PASS policy tab navigation");
    await context.close();
  }

  // 5-1) 목차 스크롤스파이 — 창이 커도 최상단은 첫 항목, 최하단은 마지막 항목.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("policy/terms", base).href);
    const toc = page.getByRole("navigation", { name: "이용약관 목차" });
    const activeLabel = () => toc.locator("a[aria-current='location']").textContent();
    await page.getByRole("heading", { name: "이용약관", exact: true }).waitFor();
    assert.equal(await activeLabel(), "목적", "최상단에서는 첫 항목이 활성");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    assert.equal(await activeLabel(), "약관 변경", "문서 끝에서는 마지막 항목이 활성");
    await toc.getByRole("link", { name: "물품 대여" }).click();
    await page.waitForTimeout(900);
    assert.equal(await activeLabel(), "물품 대여", "클릭한 항목이 활성");
    await page.mouse.move(400, 300);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -600);
    await page.waitForTimeout(500);
    assert.equal(await activeLabel(), "목적", "직접 스크롤하면 다시 위치를 따라감");
    console.log("PASS doc toc scrollspy");
    await context.close();
  }

  // 6) 회원 관리 — 대여 중 회원은 삭제가 막히고, 가능한 회원은 확인 후 삭제된다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(new URL("admin/members", base).href);
    const busy = page.locator(".member", { hasText: "대여 중 회원" });
    await busy.waitFor();
    assert.equal(
      await busy.getByRole("button", { name: "등록 정보 삭제", exact: true }).isDisabled(),
      true,
    );
    const ready = page.locator(".member", { hasText: "정리 회원" });
    await ready.getByRole("button", { name: "등록 정보 삭제", exact: true }).click();
    await page.getByText(/완료된 대여·관리 이력은 익명으로 보존/).waitFor();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await ready.getByRole("button", { name: "등록 정보 삭제", exact: true }).click();
    await page.getByRole("button", { name: "등록 정보 삭제", exact: true }).last().click();
    await ready.waitFor({ state: "detached" });
    console.log("PASS member delete guard and confirmation");
    await context.close();
  }

  // 7) 프로필 저장 — PUT 한 번, 내 정보로 이동, 값 반영.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let user = { ...MEMBER, phone: null, affiliation: null };
    const updates = [];
    await page.route("**/api/me", (route) => route.fulfill({ json: { user } }));
    await page.route("**/api/me/profile", async (route) => {
      const body = route.request().postDataJSON();
      updates.push(body);
      user = {
        ...user,
        name: body.name,
        phone: body.phone,
        branch: body.branch,
        group: body.group,
        affiliation: `${body.division} · ${body.branch} · ${body.group}`,
      };
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("signup/profile", base).href);
    await page.getByLabel("휴대폰 번호").fill("010-0000-0001");
    // 지부를 먼저 고르면 청년지부의 지회·모둠 select 가 열린다.
    await page.getByLabel("지부").selectOption("청년지부");
    // 모둠은 지회에 종속된다 — 새 지회에 없는 모둠은 비우고, 공통 모둠은 유지한다.
    await page.getByLabel("지회").selectOption("경기");
    await page.getByLabel("모둠").selectOption("동부");
    await page.getByLabel("지회").selectOption("서울");
    assert.equal(await page.getByLabel("모둠").inputValue(), "동부");
    await page.getByLabel("지회").selectOption("남부");
    assert.equal(await page.getByLabel("모둠").inputValue(), "");
    await page.getByLabel("모둠").selectOption("충청");
    await page.getByLabel("지회").selectOption("서울");
    assert.equal(await page.getByLabel("모둠").inputValue(), "");
    await page.getByLabel("모둠").selectOption("동부");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForURL(base + "mypage");
    await page.getByText("010-0000-0001", { exact: true }).waitFor();
    await page.getByText("청년지부 · 서울 · 동부", { exact: true }).waitFor();
    assert.deepEqual(updates, [
      {
        name: "김하늘",
        phone: "010-0000-0001",
        division: "청년지부",
        branch: "서울",
        group: "동부",
      },
    ]);
    console.log("PASS profile save refreshes mypage");
    await context.close();
  }

  // 7-1) 저장된 소속은 지부·지회·모둠 select 로 복원된다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("signup/profile", base).href);
    await page.locator(".profile-form").waitFor();
    assert.equal(await page.getByLabel("지부").inputValue(), "청년지부");
    assert.equal(await page.getByLabel("지회").inputValue(), "서울");
    assert.equal(await page.getByLabel("모둠").inputValue(), "동부");
    // 지회·모둠은 가로 2열, 지회 옵션에는 "지회"가 붙지 않는다
    assert.deepEqual(
      await page.getByLabel("지회").locator("option").allTextContents(),
      ["선택", "서울", "경기", "남부"],
    );
    const branchBox = await page.getByLabel("지회").boundingBox();
    const groupBox = await page.getByLabel("모둠").boundingBox();
    assert.ok(branchBox && groupBox, "지회·모둠 select가 보여야 한다");
    assert.ok(Math.abs(branchBox.y - groupBox.y) < 2, "지회·모둠은 같은 줄에 있어야 한다");
    assert.ok(groupBox.x > branchBox.x, "모둠은 지회 오른쪽에 있어야 한다");
    console.log("PASS profile selects hydrate from saved affiliation");
    await context.close();
  }

  // 7-2) 대중지부는 지회·모둠을 직접 입력하고, 저장값에서 그대로 복원한다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let user = { ...MEMBER, affiliation: "대중지부 · 부산 · 해운대" };
    const updates = [];
    await page.route("**/api/me", (route) => route.fulfill({ json: { user } }));
    await page.route("**/api/me/profile", async (route) => {
      const body = route.request().postDataJSON();
      updates.push(body);
      user = {
        ...user,
        name: body.name,
        phone: body.phone,
        affiliation: `${body.division} · ${body.branch} · ${body.group}`,
      };
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("signup/profile", base).href);
    await page.locator(".profile-form").waitFor();
    assert.equal(await page.getByLabel("지부").inputValue(), "대중지부");
    assert.equal(await page.getByLabel("지회").inputValue(), "부산");
    assert.equal(await page.getByLabel("모둠").inputValue(), "해운대");
    await page.getByLabel("지부").selectOption("대중지부");
    await page.getByLabel("지회").fill("광주");
    await page.getByLabel("모둠").fill("서구");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForURL(base + "mypage");
    await page.getByText("대중지부 · 광주 · 서구", { exact: true }).waitFor();
    assert.deepEqual(updates, [
      {
        name: "김하늘",
        phone: "010-0000-0000",
        division: "대중지부",
        branch: "광주",
        group: "서구",
      },
    ]);
    console.log("PASS public division profile saves free-form affiliation");
    await context.close();
  }

  // 8) 물품 수정은 관리자 단건 + 공개 상세를 합쳐 초기값을 채운다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(new URL("items/101/edit", base).href);
    await page.getByRole("heading", { name: "물품 수정", exact: true }).waitFor();
    assert.equal(await page.getByLabel("이름 *").inputValue(), "4인용 텐트");
    assert.equal(await page.getByLabel("보관 위치").inputValue(), "7층 비품실");
    await page.locator(".category-tags-input .tag").filter({ hasText: "캠핑" }).waitFor();
    const saveBox = await page.getByRole("button", { name: "저장", exact: true }).boundingBox();
    assert.ok(saveBox && saveBox.y + saveBox.height <= 900, "저장 버튼이 첫 화면에 보여야 한다");
    console.log("PASS edit form hydrates from admin and public detail");
    await context.close();
  }

  // 9) 물품 등록 — 빈 이름은 막고, 저장하면 POST 후 목록으로 돌아간다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    let createBody = null;
    await page.route("**/api/admin/items", async (route) => {
      if (route.request().method() === "POST") {
        createBody = route.request().postDataJSON();
        await route.fulfill({ json: { id: 999 } });
        return;
      }
      await route.fallback();
    });
    await page.goto(new URL("items/new", base).href);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("물품 이름을 입력해 주세요.", { exact: true }).waitFor();
    assert.equal(createBody, null);
    await page.getByLabel("이름 *").fill("새 텐트");
    await page.getByLabel("보관 위치").fill("3층 창고");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForURL(new URL("items/999", base).href);
    assert.equal(createBody.name, "새 텐트");
    assert.equal(createBody.location, "3층 창고");
    assert.deepEqual(createBody.category_ids, []);
    console.log("PASS item create validation and POST");
    await context.close();
  }

  // 9-1) 한글 IME 조합 중 엔터 — 마지막 글자가 별도 태그로 남지 않는다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(new URL("items/new", base).href);
    await page.getByRole("heading", { name: "물품 등록", exact: true }).waitFor();
    const input = page.locator(".category-tags-input input");
    await input.click();
    // 실제 IME 순서를 흉내 낸다: 조합 중 엔터 keydown(isComposing) →
    // compositionend. 조합 중에 커밋하면 입력값이 비워지면서 조합 중이던
    // 마지막 글자가 따로 남아 태그가 둘로 갈라진다.
    await input.fill("불교대");
    await input.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      );
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "대" }));
    });
    await page.locator(".category-tags-input .tag", { hasText: "불교대" }).waitFor();
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".category-tags-input .tag").count(), 1);
    assert.equal(await input.inputValue(), "");
    console.log("PASS korean IME enter does not split tag");
    await context.close();
  }

  // 10) 관리자 홈은 관리자 목록을 쓰고 등록 진입점을 보여준다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(base);
    await page.locator(".item-card").first().waitFor();
    await page.locator(".home-side").getByText("물품 등록", { exact: true }).waitFor();
    console.log("PASS admin home list and register entry");
    await context.close();
  }

  // 10-1) 관리자 목록 카드는 상세로 가고, 상세의 '수정'으로 수정 화면에 들어간다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(base);
    await page.locator(".item-card").first().click();
    await page.waitForURL(new URL("items/101", base).href);
    await page.locator(".item-rental-form").waitFor();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await page.waitForURL(new URL("items/101/edit", base).href);
    await page.getByRole("heading", { name: "물품 수정", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "공개 보기", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await page.waitForURL(new URL("items/101", base).href);
    console.log("PASS admin list opens detail, edit returns to detail");
    await context.close();
  }

  // 11) 관리자도 헤더에서 대여 내역으로 이동할 수 있다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(base);
    await page.locator(".item-card").first().waitFor();
    await page
      .locator("header")
      .getByRole("link", { name: "대여 내역", exact: true })
      .click();
    await page.waitForURL(base + "my/rentals");
    await page.locator(".reservation-row").first().waitFor();
    await page
      .locator(".reservation-row", { hasText: "선풍기" })
      .getByText("기한 지남", { exact: true })
      .waitFor();
    console.log("PASS admin can open my rentals from header");
    await context.close();
  }

  // 12) 관리자는 기한 지난 대여만 모아 볼 수 있다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(new URL("admin/reservations", base).href);
    await page.locator(".reservation-row").first().waitFor();
    await page.getByRole("button", { name: "기한 지남", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".reservation-row").count(), 1);
    await page.getByText(/기한이 지났습니다/).waitFor();
    console.log("PASS admin overdue filter");
    await context.close();
  }

  // 13) 관리자는 승인 대기 신청을 승인하거나 사유를 남겨 거절한다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    let rejectBody = null;
    let approved = false;
    await page.route("**/api/admin/reservations/*/reject", async (route) => {
      rejectBody = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.route("**/api/admin/reservations/*/approve", async (route) => {
      approved = true;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("admin/reservations", base).href);
    const pending = page.locator(".reservation-row", { hasText: "주말 캠핑" });
    await pending.getByRole("button", { name: "거절", exact: true }).click();
    const rejectDialog = page.getByRole("dialog");
    await rejectDialog.getByLabel("거절 사유 *").fill("재고 부족");
    await rejectDialog.getByRole("button", { name: "거절", exact: true }).click();
    await page.getByText("신청을 거절했습니다", { exact: true }).waitFor();
    assert.deepEqual(rejectBody, { reason: "재고 부족" });

    await pending.getByRole("button", { name: "승인", exact: true }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "승인", exact: true }).click();
    await page.getByText("신청을 승인했습니다", { exact: true }).waitFor();
    assert.equal(approved, true);
    console.log("PASS admin approve and reject flows");
    await context.close();
  }

  // 13-2) 관리자는 여러 건을 선택해 한 번에 승인하거나 거절한다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    let approveBody = null;
    let rejectBody = null;
    await page.route("**/api/admin/reservations/approve", async (route) => {
      approveBody = route.request().postDataJSON();
      await route.fulfill({ json: { approved: [4, 6], failed: [] } });
    });
    await page.route("**/api/admin/reservations/reject", async (route) => {
      rejectBody = route.request().postDataJSON();
      await route.fulfill({ json: { rejected: [4, 6], failed: [] } });
    });
    await page.goto(new URL("admin/reservations", base).href);
    const pending = page.locator(".reservation-row", { hasText: "주말 캠핑" });
    const reserved = page.locator(".reservation-row", { hasText: "무선 마이크" });
    await pending.getByRole("checkbox").check();
    await reserved.getByRole("checkbox").check();
    await page.getByText("2건 선택", { exact: true }).waitFor();

    await page.getByRole("button", { name: "선택 승인 (2)", exact: true }).click();
    const approveDialog = page.getByRole("dialog");
    await approveDialog.getByRole("button", { name: "2건 승인", exact: true }).click();
    await page.getByText("2건을 승인했습니다", { exact: true }).waitFor();
    assert.deepEqual(approveBody?.ids, [4, 6]);
    assert.ok(approveBody?.due_date, "일괄 승인에도 반납 예정일이 담겨야 한다");

    await pending.getByRole("checkbox").check();
    await reserved.getByRole("checkbox").check();
    await page.getByRole("button", { name: "선택 거절 (2)", exact: true }).click();
    const rejectDialog = page.getByRole("dialog");
    await rejectDialog.getByLabel("거절 사유 *").fill("행사 취소");
    await rejectDialog.getByRole("button", { name: "2건 거절", exact: true }).click();
    await page.getByText("2건을 거절했습니다", { exact: true }).waitFor();
    assert.deepEqual(rejectBody, { ids: [4, 6], reason: "행사 취소" });
    console.log("PASS admin bulk approve and reject flows");
    await context.close();
  }

  // 14) 회원이 관리자 화면을 열면 권한 안내가 있는 홈으로 보낸다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("admin/members", base).href);
    await page.getByText(/관리자 권한이 필요합니다/).waitFor();
    assert.equal(page.url(), base);
    console.log("PASS member admin route redirects with denied notice");
    await context.close();
  }

  // 15) 반납 모달은 사진 없이도 반납을 완료하고, 대여 반납 API 를 호출한다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    let returned = false;
    await page.route("**/api/reservations/*/return", async (route) => {
      returned = true;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("my/rentals", base).href);
    const row = page.locator(".reservation-row", {
      hasText: "10/30 청년 모임",
    });
    await row.getByRole("button", { name: "반납하기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "반납하기", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "반납 완료", exact: true }).click();
    await page.getByText(/반납을 완료했습니다/).waitFor();
    assert.equal(returned, true);
    console.log("PASS return dialog completes without photos");
    await context.close();
  }

  // 16-1) 내 대여에 예약 대기 섹션과 순번이 보인다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("my/rentals", base).href);
    await page.getByText("예약 대기", { exact: true }).waitFor();
    await page.getByText("무선 마이크 · 2개", { exact: true }).waitFor();
    await page.getByText(/앞에 2개 대기 중/).waitFor();
    console.log("PASS my rentals reserved section");
    await context.close();
  }

  // 16-2) 관리자는 예약 대기만 모아 보고, 반납일을 정해 승인할 수 있다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    let approveBody = null;
    await page.route("**/api/admin/reservations/*/approve", async (route) => {
      approveBody = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("admin/reservations", base).href);
    await page.getByRole("button", { name: "예약 대기", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".reservation-row").count(), 1);
    await page.getByText(/앞에 2개 대기/).waitFor();
    await page
      .locator(".reservation-row")
      .first()
      .getByRole("button", { name: "승인", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("반납 예정일 *").waitFor();
    await dialog.getByRole("button", { name: "승인", exact: true }).click();
    await page.getByText("신청을 승인했습니다", { exact: true }).waitFor();
    assert.ok(approveBody?.due_date, "승인 요청에 반납일이 담겨야 한다");
    console.log("PASS admin reserved approve flow");
    await context.close();
  }

  // 16) 모바일 폭에서 가로 스크롤이 없다 — 긴 이름·이메일·소속 카드 포함.
  for (const [user, routes] of [
    [MEMBER, ["/", "/items/101", "/mypage", "/my/rentals", "/policy/privacy", "/design"]],
    [ADMIN, ["/admin/members", "/admin/reservations"]],
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await mockApi(page, user);
    for (const route of routes) {
      await page.goto(new URL(route.replace(/^\//, ""), base).href, {
        waitUntil: "networkidle",
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(overflow <= 1, `${route} horizontal overflow ${overflow}px`);
    }
    await context.close();
  }
  console.log("PASS no horizontal overflow at 390px");

  await writeFile(path.join(screenshotDir, ".gitkeep"), "");
} finally {
  await browser?.close();
  await server.close();
}
