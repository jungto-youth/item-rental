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
  role: "user",
  deactivated_at: null,
};

const ADMIN = {
  id: "admin",
  email: "admin@example.invalid",
  name: "김운영",
  phone: "010-0000-0000",
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
    description: "바닥재와 팩이 함께 들어 있어요.",
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
];

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
  },
];

const ADMIN_RESERVATIONS = RESERVATIONS.map((row, index) => ({
  ...row,
  total_qty: 5,
  member_id: `member-${index}`,
  member_name: "김하늘",
  member_email: "member@example.invalid",
  member_phone: "010-0000-0000",
  admin_name: row.status === "returned" ? "김운영" : null,
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
      let items = ITEMS;
      if (state === "available") {
        items = items.filter((item) => (item.rentable_qty ?? 0) > 0);
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
          summary: { types: 3, available: 2, rented: 1, repair: 1 },
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
      return route.fulfill({ json: { ok: true } });
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
      if (parts.length === 5 && parts[4] === "adjustments") {
        if (route.request().method() === "POST") {
          return route.fulfill({
            json: { ok: true, total_qty: ITEMS[0].total_qty },
          });
        }
        return route.fulfill({ json: { adjustments: [] } });
      }
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
    await page.getByText("대여했어요", { exact: true }).waitFor();
    console.log("PASS rental success state");
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
    await page.locator(".page-policy .tabs").getByRole("link", { name: "이용약관", exact: true }).click();
    await page.getByRole("heading", { name: "서비스 이용약관", exact: true }).waitFor();
    console.log("PASS policy tab navigation");
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
    let user = { ...MEMBER, phone: null };
    const updates = [];
    await page.route("**/api/me", (route) => route.fulfill({ json: { user } }));
    await page.route("**/api/me/profile", async (route) => {
      const body = route.request().postDataJSON();
      updates.push(body);
      user = { ...user, ...body };
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(new URL("signup/profile", base).href);
    await page.getByLabel("휴대폰 번호").fill("010-0000-0001");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForURL(base + "mypage");
    await page.getByText("010-0000-0001", { exact: true }).waitFor();
    assert.deepEqual(updates, [{ name: "김하늘", phone: "010-0000-0001" }]);
    console.log("PASS profile save refreshes mypage");
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
    console.log("PASS edit form hydrates from admin and public detail");
    await context.close();
  }

  // 8-1) 수량 조정 — 보유 수량을 바로 바꾸고 이력을 남긴다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    let posted = null;
    await page.route("**/api/admin/items/101/adjustments", async (route) => {
      if (route.request().method() === "POST") {
        posted = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true, total_qty: 6 } });
        return;
      }
      await route.fulfill({
        json: {
          adjustments: [
            {
              id: 1,
              item_id: 101,
              kind: "lost",
              qty: 1,
              total_qty_before: 7,
              total_qty_after: 6,
              memo: "파손",
              actor_id: "admin",
              actor_name: "김운영",
              created_at: "2026-11-03T00:00:00.000Z",
            },
          ],
        },
      });
    });
    await page.goto(new URL("items/101/edit", base).href);
    await page.getByRole("heading", { name: "물품 수정", exact: true }).waitFor();
    await page.getByRole("heading", { name: "수량 조정", exact: true }).waitFor();
    await page.getByRole("button", { name: "망실", exact: true }).click();
    await page.getByLabel("수량 *", { exact: true }).fill("1");
    await page.getByLabel("사유 메모 (선택)").fill("파손");
    await page.getByRole("button", { name: "수량 조정", exact: true }).click();
    await page
      .getByText("망실 1개를 반영했어요. 현재 보유 6개", { exact: true })
      .waitFor();
    assert.deepEqual(posted, { kind: "lost", qty: 1, memo: "파손" });
    assert.equal(await page.getByLabel("보유 수량 *").inputValue(), "6");
    await page.getByText("보유 7 → 6", { exact: false }).waitFor();
    console.log("PASS item quantity adjustment");
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
    await page.waitForURL(base);
    assert.equal(createBody.name, "새 텐트");
    assert.equal(createBody.location, "3층 창고");
    assert.deepEqual(createBody.category_ids, []);
    console.log("PASS item create validation and POST");
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

  // 11) 관리자도 헤더에서 내 대여 내역으로 이동할 수 있다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, ADMIN);
    await page.goto(base);
    await page.locator(".item-card").first().waitFor();
    await page.getByRole("link", { name: "내 대여", exact: true }).click();
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
    await page.getByText(/기한이 지났어요/).waitFor();
    console.log("PASS admin overdue filter");
    await context.close();
  }

  // 13) 회원이 관리자 화면을 열면 권한 안내가 있는 홈으로 보낸다.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    await page.goto(new URL("admin/members", base).href);
    await page.getByText(/관리자 권한이 필요해요/).waitFor();
    assert.equal(page.url(), base);
    console.log("PASS member admin route redirects with denied notice");
    await context.close();
  }

  // 14) 모바일 폭에서 가로 스크롤이 없다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await mockApi(page, MEMBER);
    for (const route of ["/", "/items/101", "/mypage", "/my/rentals", "/policy/privacy"]) {
      await page.goto(new URL(route.replace(/^\//, ""), base).href, {
        waitUntil: "networkidle",
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(overflow <= 1, `${route} horizontal overflow ${overflow}px`);
    }
    console.log("PASS no horizontal overflow at 390px");
    await context.close();
  }

  await writeFile(path.join(screenshotDir, ".gitkeep"), "");
} finally {
  await browser?.close();
  await server.close();
}
