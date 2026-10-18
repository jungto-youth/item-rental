// 관리자 라우트 권한 — 구조 자체를 검증한다.
//
// 왜 이 파일이 필요한가: 모든 admin 라우트는 `.use("*", requireAdmin)` 를 선언하고 있고
// 지금은 다 올바르다. 하지만 이 보호가 사라지는 경로는 '새 admin 라우트 파일을 만들면서
// 그 한 줄을 잊는 것'이고, 기존 테스트들은 특정 경로만 403 을 확인하므로 그 시나리오를
// 전혀 잡지 못한다. 여기서 두 가지를 함께 막는다:
//   1) 라우트 선언 자체를 검사한다 — 보호가 없는 admin 라우트가 존재하면 실패
//   2) 전수 경로를 실제로 호출한다 — 선언이 있어도 실제 적용이 안 되면 실패
import { test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { httpFixture, TEST_ORIGIN } from "./_http.fixture.ts";

const adminDir = fileURLToPath(new URL("../src/routes/admin/", import.meta.url));
const files = readdirSync(adminDir).filter((f) => f.endsWith(".ts"));

// 호출에 필요한 최소 본문 — 권한이 걸리기 전에 본문 검증에 걸리면 안 되므로 형식은 갖춘다.
// 경로가 같은 라우트가 여러 메서드일 수 있어 '경로 + 메서드'를 키로 쓴다.
const calls: { path: string; method: string; body?: string; contentType?: string }[] = [
  { path: "/api/admin/items", method: "GET" },
  { path: "/api/admin/items", method: "POST", body: '{"name":"x"}', contentType: "application/json" },
  { path: "/api/admin/items/1", method: "GET" },
  { path: "/api/admin/items/1", method: "PUT", body: '{"name":"x"}', contentType: "application/json" },
  { path: "/api/admin/items/1", method: "DELETE" },
  { path: "/api/admin/items/1/photos", method: "POST", body: "x", contentType: "text/plain" },
  { path: "/api/admin/items/1/photos/1", method: "DELETE" },
  { path: "/api/admin/categories", method: "POST", body: '{"name":"x"}', contentType: "application/json" },
  { path: "/api/admin/categories/1", method: "PATCH", body: '{"name":"x"}', contentType: "application/json" },
  { path: "/api/admin/categories/1", method: "DELETE" },
  { path: "/api/admin/members", method: "GET" },
  { path: "/api/admin/members/1", method: "DELETE" },
  { path: "/api/admin/members/1/role", method: "PUT", body: '{"role":"user"}', contentType: "application/json" },
  { path: "/api/admin/members/1/withdraw", method: "POST" },
  { path: "/api/admin/reservations", method: "GET" },
  { path: "/api/admin/reservations/1/return", method: "POST" },
  { path: "/api/admin/allowed-emails", method: "GET" },
  { path: "/api/admin/allowed-emails", method: "POST", body: '{"email":"a@b.kr"}', contentType: "application/json" },
  { path: "/api/admin/allowed-emails/x", method: "DELETE" },
  { path: "/api/admin/dashboard", method: "GET" },
  { path: "/api/admin/reembed-all", method: "POST" },
];

// 라우트 파일 → 실제 경로. 파일이 늘면 이 목록도 같이 늘어야 하고,
// 그 누락은 아래 '커버리지' 테스트가 잡아낸다
const byFile: Record<string, string[]> = {
  "items.ts": [
    "/api/admin/items",
    "/api/admin/items/1",
    "/api/admin/items/1/photos",
    "/api/admin/items/1/photos/1",
  ],
  "categories.ts": ["/api/admin/categories", "/api/admin/categories/1"],
  "members.ts": [
    "/api/admin/members",
    "/api/admin/members/1",
    "/api/admin/members/1/role",
    "/api/admin/members/1/withdraw",
  ],
  "reservations.ts": ["/api/admin/reservations", "/api/admin/reservations/1/return"],
  "allowed-emails.ts": ["/api/admin/allowed-emails", "/api/admin/allowed-emails/x"],
  "dashboard.ts": ["/api/admin/dashboard"],
  "reembed.ts": ["/api/admin/reembed-all"],
};

test("admin routes: every admin route file declares requireAdmin on all paths", () => {
  const unprotected: string[] = [];
  for (const file of files) {
    const src = readFileSync(`${adminDir}${file}`, "utf8");
    // .use("*", requireAdmin) 또는 use(/^\/.*/, requireAdmin) 처럼 전체 경로를 묶는 선언
    const guarded = /\.use\(\s*["'`]\/?(\*|\/.*)["'`]\s*,\s*requireAdmin\s*\)/.test(src);
    if (!guarded) unprotected.push(file);
  }
  expect(unprotected).toEqual([]);
});

test("admin routes: coverage list tracks the files on disk", () => {
  // 관리자 라우트 파일이 늘었는데 byFile 에 빠졌으면 그 새 파일은 권한 검증 대상에서
  // 조용히 빠진다 — 여기서 실패시킨다
  expect(Object.keys(byFile).sort()).toEqual([...files].sort());
});

test("admin routes: a regular member gets 403 and an anonymous caller gets 401 on every path", async () => {
  const { db, request, member } = httpFixture();
  try {
    const user = await member("user", "user");
    const admin = await member("admin", "admin");

    expect(calls.length).toBeGreaterThan(0);

    for (const { path, method, body, contentType } of calls) {
      const headers = (cookie?: string) => {
        const h: Record<string, string> = { origin: TEST_ORIGIN };
        if (cookie) h.cookie = cookie;
        if (body) h["content-type"] = contentType ?? "application/json";
        return h;
      };
      const init = (cookie?: string) => ({
        method,
        headers: headers(cookie),
        ...(body ? { body } : {}),
      });

      // 익명 → 401, 로그인한 일반 회원 → 403
      expect((await request(path, init())).status, `익명 ${method} ${path}`).toBe(401);
      expect(
        (await request(path, init(user))).status,
        `일반 회원 ${method} ${path}`,
      ).toBe(403);

      // 관리자는 권한 층을 통과한다 — 401/403 이 아니어야 한다 (404/400/415 는 정상)
      const adminRes = await request(path, init(admin));
      expect(
        [401, 403],
        `관리자도 막혔다 ${method} ${path} → ${adminRes.status}`,
      ).not.toContain(adminRes.status);
    }
  } finally {
    db.close();
  }
});