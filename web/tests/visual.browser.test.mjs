// 시각 회귀 기준선 — 실제 페이지를 고정 fixture로 렌더하고 390/768/1280에서 비교한다.
// 실행:
//   npm run test:visual          — 기준선과 비교
//   npm run test:visual:update   — 기준선 갱신
//
// 기준선은 같은 브라우저/OS에서만 동일하게 렌더된다. CI에서는 컨테이너 이미지를 고정한다.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const UPDATE = process.argv.includes("--update");
const baselineDir = fileURLToPath(new URL("./visual/baseline/", import.meta.url));
const currentDir = fileURLToPath(new URL("./visual/current/", import.meta.url));
const VIEWPORTS = [390, 768, 1280];
const MAX_DIFF_RATIO = 0.001;

const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <rect width="400" height="300" fill="#e6e6e6"/>
    <path d="M70 230l90-105 65 75 45-50 70 80z" fill="#bdbdbd"/>
    <circle cx="305" cy="78" r="26" fill="#bdbdbd"/>
  </svg>`,
)}`;

const MEMBER = {
  id: "visual-member",
  email: "member@example.invalid",
  name: "김하늘",
  phone: "010-0000-0000",
  role: "user",
  deactivated_at: null,
};

const ADMIN = {
  id: "visual-admin",
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
    photos: [{ id: 1, url: PHOTO }],
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
    name: "휴지통",
    lifecycle: "active",
    total_qty: 3,
    qty_repair: 0,
    rentable_qty: 3,
    kind: "rental",
    location: "2층 여자탈의실",
    photos: [],
    availability_badge: "available",
    active_now: 0,
    categories: [{ id: 3, name: "청소" }],
  },
  {
    id: 104,
    name: "아광주차콘",
    lifecycle: "active",
    total_qty: 3,
    qty_repair: 0,
    rentable_qty: 3,
    kind: "rental",
    location: "7층",
    photos: [],
    availability_badge: "available",
    active_now: 2,
    categories: [{ id: 2, name: "행사" }],
  },
  {
    id: 105,
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
    categories: [{ id: 4, name: "사무" }],
  },
  {
    id: 106,
    name: "돗자리",
    lifecycle: "active",
    total_qty: 2,
    qty_repair: 0,
    rentable_qty: 2,
    kind: "rental",
    location: "7층 비품실",
    photos: [],
    availability_badge: "available",
    active_now: 1,
    categories: [{ id: 1, name: "캠핑" }],
  },
];

const SUMMARY = { types: 6, available: 5, rented: 3, repair: 2 };

const MEMBERS = [
  {
    ...ADMIN,
    created_at: "2026-01-01",
    active_rental_count: 0,
  },
  {
    id: "visual-member",
    email: "member@example.invalid",
    name: "김하늘",
    phone: "010-0000-0000",
    role: "user",
    deactivated_at: null,
    created_at: "2026-02-01",
    active_rental_count: 2,
  },
  {
    id: "visual-ready",
    email: "ready@example.invalid",
    name: "정리 회원",
    phone: null,
    role: "user",
    deactivated_at: "2026-09-01",
    created_at: "2026-03-01",
    active_rental_count: 0,
  },
];

function filterItems(state) {
  if (!state) return ITEMS;
  if (state === "available") {
    return ITEMS.filter((it) => it.kind !== "consumable" && (it.rentable_qty ?? 0) > 0);
  }
  if (state === "rented") return ITEMS.filter((it) => (it.active_now ?? 0) > 0);
  if (state === "repair") return ITEMS.filter((it) => (it.qty_repair ?? 0) > 0);
  return ITEMS;
}

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
      const items = filterItems(url.searchParams.get("state"));
      return route.fulfill({
        json: {
          items,
          total: ITEMS.length,
          matched: items.length,
          summary: SUMMARY,
          hasMore: false,
        },
      });
    }
    const id = Number(url.pathname.split("/").pop());
    const item = ITEMS.find((it) => it.id === id) ?? ITEMS[0];
    return route.fulfill({ json: { item } });
  });

  if (user?.role === "admin") {
    await page.route("**/api/admin/members**", (route) => route.fulfill({ json: { members: MEMBERS } }));
    await page.route("**/api/admin/allowed-emails**", (route) =>
      route.fulfill({ json: { allowedEmails: [] } }),
    );
  }
}

const SCREENS = [
  { name: "home", path: "/", user: MEMBER, ready: "item-card" },
  { name: "detail", path: "/items/101", user: MEMBER, ready: "item-rental-form" },
  { name: "login", path: "/login", user: null, ready: "page-login" },
  {
    name: "login-dev",
    path: "/login",
    user: null,
    ready: "#dev-code",
    mock: { devLogin: true },
    viewports: [390, 1280],
  },
  { name: "members", path: "/admin/members", user: ADMIN, ready: "reservation-row" },
];

await mkdir(baselineDir, { recursive: true });
await mkdir(currentDir, { recursive: true });

const server = await createServer({
  configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const base = server.resolvedUrls.local[0];

  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await mockApi(page, screen.user, screen.mock);

    const viewports = screen.viewports ?? VIEWPORTS;
    for (const width of viewports) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(new URL(screen.path.replace(/^\//, ""), base).href, {
        waitUntil: "networkidle",
      });
      await page.locator(screen.ready).first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.waitForTimeout(250);

      const actual = await page.screenshot({ fullPage: true });
      const file = path.join(baselineDir, `${screen.name}-${width}.png`);

      if (UPDATE) {
        await writeFile(file, actual);
        console.log(`UPDATED ${screen.name}-${width}.png`);
        continue;
      }

      let expected;
      try {
        expected = await readFile(file);
      } catch {
        assert.fail(
          `기준 이미지가 없습니다: ${path.relative(process.cwd(), file)}\n` +
            "먼저 `npm run test:visual:update`로 기준선을 만들어 주세요.",
        );
      }

      const expectedPng = PNG.sync.read(expected);
      const actualPng = PNG.sync.read(actual);
      if (
        expectedPng.width !== actualPng.width ||
        expectedPng.height !== actualPng.height
      ) {
        const current = path.join(currentDir, `${screen.name}-${width}.png`);
        await writeFile(current, actual);
        assert.fail(
          `시각 회귀(크기): ${screen.name} ${width}px ` +
            `${expectedPng.width}x${expectedPng.height} → ${actualPng.width}x${actualPng.height}\n` +
            `현재 화면: ${path.relative(process.cwd(), current)}`,
        );
      }

      const diffPng = new PNG({ width: actualPng.width, height: actualPng.height });
      const changed = pixelmatch(
        expectedPng.data,
        actualPng.data,
        diffPng.data,
        actualPng.width,
        actualPng.height,
        { threshold: 0.12, includeAA: false },
      );
      const ratio = changed / (actualPng.width * actualPng.height);
      if (ratio > MAX_DIFF_RATIO) {
        const current = path.join(currentDir, `${screen.name}-${width}.png`);
        const diff = path.join(currentDir, `${screen.name}-${width}-diff.png`);
        await writeFile(current, actual);
        await writeFile(diff, PNG.sync.write(diffPng));
        assert.fail(
          `시각 회귀: ${screen.name} ${width}px — ${changed}px (${(ratio * 100).toFixed(3)}%)\n` +
            `현재 화면: ${path.relative(process.cwd(), current)}\n` +
            `차이 이미지: ${path.relative(process.cwd(), diff)}\n` +
            `기준 화면: ${path.relative(process.cwd(), file)}`,
        );
      }
      console.log(`PASS ${screen.name}-${width}.png`);
    }

    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
