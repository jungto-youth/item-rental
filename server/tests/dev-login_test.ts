import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { assertEquals, assertMatch } from "@std/assert";
import { encode } from "@auth/core/jwt";
import app from "../src/index.ts";
import { LOCAL_TEST_ADMIN_ID } from "../src/local-test-login.ts";
import type { Bindings, SessionUser } from "../src/types.ts";

// Synthetic private-network origin; requests use the in-memory app, not the network.
const origin = "http://192.168.0.123:8787";

async function withFlag(flag: boolean | undefined, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "LOCAL_TEST_LOGIN");
  if (flag === undefined) Reflect.deleteProperty(globalThis, "LOCAL_TEST_LOGIN");
  else Object.defineProperty(globalThis, "LOCAL_TEST_LOGIN", { configurable: true, value: flag });
  try {
    await run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "LOCAL_TEST_LOGIN", previous);
    else Reflect.deleteProperty(globalThis, "LOCAL_TEST_LOGIN");
  }
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../migrations-d1/0001_baseline.sql", import.meta.url), "utf8"));
  const env = {
    AUTH_SECRET: "local-test-fixture-secret-not-used-outside-tests",
    DB: {
      prepare(sql: string) {
        return {
          bind(...params: SQLInputValue[]) {
            return { all: async () => ({ results: db.prepare(sql).all(...params) }) };
          },
        };
      },
    },
  } as unknown as Bindings;
  const request = (path: string, init?: RequestInit, base = origin) =>
    app.fetch(new Request(base + path, init), env);
  return { db, env, request };
}

Deno.test("dev login: absent/false compile-time flag keeps login disabled and writes no member", async () => {
  for (const flag of [undefined, false]) {
    await withFlag(flag, async () => {
      const { db, request } = fixture();
      try {
        const info = await request("/api/dev/login");
        assertEquals(await info.json(), { enabled: false });
        const res = await request("/api/dev/login", { method: "POST", headers: { origin } });
        assertEquals(res.status, 404);
        assertEquals(res.headers.get("set-cookie"), null);
        assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 0);
      } finally { db.close(); }
    });
  }
});

Deno.test("dev login: flag cannot enable login on a public hostname", async () => {
  await withFlag(true, async () => {
    const { db, request } = fixture();
    try {
      for (const base of ["https://example.com", "https://item-rental.workers.dev", "http://8.8.8.8"]) {
        assertEquals(await (await request("/api/dev/login", undefined, base)).json(), { enabled: false });
        assertEquals((await request("/api/dev/login", { method: "POST", headers: { origin: base } }, base)).status, 404);
      }
      assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 0);
    } finally { db.close(); }
  });
});

Deno.test("dev login: requires a same-origin POST, sets normal signed cookie, reuses admin, checks current DB role", async () => {
  await withFlag(true, async () => {
    const { db, request } = fixture();
    try {
      assertEquals(await (await request("/api/dev/login")).json(), { enabled: true });
      const invalidHeaders: HeadersInit[] = [{}, { origin: "http://evil.example" }];
      for (const headers of invalidHeaders) {
        assertEquals((await request("/api/dev/login", { method: "POST", headers })).status, 403);
      }
      assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 0);
      const login = await request("/api/dev/login", { method: "POST", headers: { origin } });
      assertEquals(login.status, 200);
      const setCookie = login.headers.get("set-cookie")!;
      assertMatch(setCookie, /authjs\.session-token=/);
      assertMatch(setCookie, /HttpOnly/i);
      assertMatch(setCookie, /SameSite=Lax/i);
      const cookie = setCookie.split(";")[0];
      const me = await request("/api/me", { headers: { cookie } });
      const { user } = await me.json() as { user: SessionUser };
      assertEquals(user.id, LOCAL_TEST_ADMIN_ID);
      assertEquals(user.role, "admin");
      assertEquals(user.name, "로컬 테스트 관리자");
      assertEquals((await request("/api/admin/items", { headers: { cookie } })).status, 200);
      await request("/api/dev/login", { method: "POST", headers: { origin } });
      assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 1);
      db.prepare("UPDATE members SET role = 'user' WHERE id = ?1").run(LOCAL_TEST_ADMIN_ID);
      assertEquals((await request("/api/admin/items", { headers: { cookie } })).status, 403);
      db.prepare("UPDATE members SET deactivated_at = '2026-01-01' WHERE id = ?1").run(LOCAL_TEST_ADMIN_ID);
      assertEquals(await (await request("/api/me", { headers: { cookie } })).json(), { user: null });
    } finally { db.close(); }
  });
});

Deno.test("dev login: test JWTs are rejected on normal builds and on public hosts", async () => {
  const { db, env, request } = fixture();
  try {
    const cookie = await withLogin();
    await withFlag(undefined, async () => {
      assertEquals(await (await request("/api/me", { headers: { cookie } })).json(), { user: null });
      assertEquals((await request("/api/admin/items", { headers: { cookie } })).status, 401);
    });
    await withFlag(true, async () => {
      assertEquals(await (await request("/api/me", { headers: { cookie } }, "https://example.com")).json(), { user: null });
      // A reserved admin ID without the test-session marker cannot become a normal session.
      const token = await encode({ secret: env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: LOCAL_TEST_ADMIN_ID } });
      assertEquals(await (await request("/api/me", { headers: { cookie: `authjs.session-token=${token}` } })).json(), { user: null });
    });
  } finally { db.close(); }

  async function withLogin() {
    let cookie = "";
    await withFlag(true, async () => {
      const res = await request("/api/dev/login", { method: "POST", headers: { origin } });
      cookie = res.headers.get("set-cookie")!.split(";")[0];
    });
    return cookie;
  }
});
