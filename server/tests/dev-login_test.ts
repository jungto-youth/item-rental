import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
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
  db.exec(readFileSync(new URL("../../migrations-d1/0003_member_registration_deleted.sql", import.meta.url), "utf8"));
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

test("dev login: absent/false compile-time flag keeps login disabled and writes no member", async () => {
  for (const flag of [undefined, false]) {
    await withFlag(flag, async () => {
      const { db, request } = fixture();
      try {
        const info = await request("/api/dev/login");
        expect(await info.json()).toEqual({ enabled: false });
        const res = await request("/api/dev/login", { method: "POST", headers: { origin } });
        expect(res.status).toBe(404);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
      } finally { db.close(); }
    });
  }
});

test("dev login: flag cannot enable login on a public hostname", async () => {
  await withFlag(true, async () => {
    const { db, request } = fixture();
    try {
      for (const base of ["https://example.com", "https://item-rental.workers.dev", "http://8.8.8.8"]) {
        expect(await (await request("/api/dev/login", undefined, base)).json()).toEqual({ enabled: false });
        expect((await request("/api/dev/login", { method: "POST", headers: { origin: base } }, base)).status).toBe(404);
      }
      expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
    } finally { db.close(); }
  });
});

test("dev login: requires a same-origin POST, sets normal signed cookie, reuses admin, checks current DB role", async () => {
  await withFlag(true, async () => {
    const { db, request } = fixture();
    try {
      expect(await (await request("/api/dev/login")).json()).toEqual({ enabled: true });
      const invalidHeaders: HeadersInit[] = [{}, { origin: "http://evil.example" }];
      for (const headers of invalidHeaders) {
        expect((await request("/api/dev/login", { method: "POST", headers })).status).toBe(403);
      }
      expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
      const login = await request("/api/dev/login", { method: "POST", headers: { origin } });
      expect(login.status).toBe(200);
      const setCookie = login.headers.get("set-cookie")!;
      expect(setCookie).toMatch(/authjs\.session-token=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      const cookie = setCookie.split(";")[0];
      const me = await request("/api/me", { headers: { cookie } });
      const { user } = await me.json() as { user: SessionUser };
      expect(user.id).toBe(LOCAL_TEST_ADMIN_ID);
      expect(user.role).toBe("admin");
      expect(user.name).toBe("로컬 테스트 관리자");
      expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(200);
      await request("/api/dev/login", { method: "POST", headers: { origin } });
      expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(1);
      db.prepare("UPDATE members SET role = 'user' WHERE id = ?1").run(LOCAL_TEST_ADMIN_ID);
      expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(403);
      db.prepare("UPDATE members SET deactivated_at = '2026-01-01' WHERE id = ?1").run(LOCAL_TEST_ADMIN_ID);
      expect(await (await request("/api/me", { headers: { cookie } })).json()).toEqual({ user: null });
    } finally { db.close(); }
  });
});

test("dev login: test JWTs are rejected on normal builds and on public hosts", async () => {
  const { db, env, request } = fixture();
  try {
    const cookie = await withLogin();
    await withFlag(undefined, async () => {
      expect(await (await request("/api/me", { headers: { cookie } })).json()).toEqual({ user: null });
      expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(401);
    });
    await withFlag(true, async () => {
      expect(await (await request("/api/me", { headers: { cookie } }, "https://example.com")).json()).toEqual({ user: null });
      // A reserved admin ID without the test-session marker cannot become a normal session.
      const token = await encode({ secret: env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: LOCAL_TEST_ADMIN_ID } });
      expect(await (await request("/api/me", { headers: { cookie: `authjs.session-token=${token}` } })).json()).toEqual({ user: null });
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
