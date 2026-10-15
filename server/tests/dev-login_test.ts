import { test, expect } from "vitest";
import { encode } from "@auth/core/jwt";
import { createDevelopmentApp } from "../dev/index.ts";
import { DEV_ADMIN_ID } from "../dev/login.ts";
import { httpFixture, TEST_CODE, TEST_ORIGIN } from "./_http.fixture.ts";

const loginBody = { method: "POST", headers: { origin: TEST_ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ code: TEST_CODE }) };

test("development login: production has no login route, even with code and legacy flag supplied", async () => {
  const { db, request } = httpFixture();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "LOCAL_TEST_LOGIN");
  Object.defineProperty(globalThis, "LOCAL_TEST_LOGIN", { configurable: true, value: true });
  try {
    expect((await request("/api/dev/login")).status).toBe(404);
    expect((await request("/api/dev/login", loginBody)).status).toBe(404);
    expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "LOCAL_TEST_LOGIN", previous);
    else Reflect.deleteProperty(globalThis, "LOCAL_TEST_LOGIN");
    db.close();
  }
});

test("development login: separate entry requires configuration and access code before creating a member", async () => {
  const { db, env, request } = httpFixture(createDevelopmentApp());
  try {
    env.DEV_LOGIN_CODE = undefined;
    expect(await (await request("/api/dev/login")).json()).toEqual({ enabled: true, configured: false });
    expect((await request("/api/dev/login", loginBody)).status).toBe(503);
    env.DEV_LOGIN_CODE = "short";
    expect((await request("/api/dev/login", loginBody)).status).toBe(503);
    env.DEV_LOGIN_CODE = TEST_CODE;
    for (const body of ["{}", '{"code":"wrong"}']) {
      expect((await request("/api/dev/login", { ...loginBody, body })).status).toBe(401);
    }
    for (const headers of [new Headers(), new Headers({ origin: "http://evil.example" })]) {
      expect((await request("/api/dev/login", { ...loginBody, headers })).status).toBe(403);
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
  } finally { db.close(); }
});

test("development login: rate limits failures without issuing a session", async () => {
  const { db, request } = httpFixture(createDevelopmentApp());
  try {
    for (let i = 0; i < 5; i++) expect((await request("/api/dev/login", { ...loginBody, body: '{"code":"wrong"}' })).status).toBe(401);
    const blocked = await request("/api/dev/login", loginBody);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
  } finally { db.close(); }
});

test("development login: signed sessions respect current role, deactivation, registration removal and code rotation", async () => {
  const { db, env, request } = httpFixture(createDevelopmentApp());
  try {
    const login = await request("/api/dev/login", loginBody);
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = setCookie.split(";")[0];
    const { user } = await (await request("/api/me", { headers: { cookie } })).json() as { user: { id: string; role: string } };
    expect(user).toMatchObject({ id: DEV_ADMIN_ID, role: "admin" });
    expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(200);
    env.DEV_LOGIN_CODE = TEST_CODE + "-rotated";
    expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(401);
    env.DEV_LOGIN_CODE = TEST_CODE;
    db.prepare("UPDATE members SET registration_deleted_at = '2026-01-01' WHERE id = ?1").run(DEV_ADMIN_ID);
    expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(401);
    db.prepare("UPDATE members SET registration_deleted_at = NULL, role = 'user' WHERE id = ?1").run(DEV_ADMIN_ID);
    expect((await request("/api/admin/items", { headers: { cookie } })).status).toBe(403);
    db.prepare("UPDATE members SET deactivated_at = '2026-01-01' WHERE id = ?1").run(DEV_ADMIN_ID);
    expect(await (await request("/api/me", { headers: { cookie } })).json()).toEqual({ user: null });
    expect((await request("/api/dev/login", loginBody)).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(1);
  } finally { db.close(); }
});

test("development login: public hosts and production reject development and legacy cookies", async () => {
  const development = httpFixture(createDevelopmentApp());
  const production = httpFixture();
  try {
    const login = await development.request("/api/dev/login", loginBody);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(await (await production.request("/api/me", { headers: { cookie } })).json()).toEqual({ user: null });
    expect((await production.request("/api/admin/items", { headers: { cookie } })).status).toBe(401);
    for (const base of ["https://example.com", "https://item-rental.workers.dev", "http://8.8.8.8"]) {
      expect((await development.request("/api/dev/login", undefined, base)).status).toBe(404);
      expect((await development.request("/api/dev/login", { ...loginBody, headers: { origin: base } }, base)).status).toBe(404);
      expect(await (await development.request("/api/me", { headers: { cookie } }, base)).json()).toEqual({ user: null });
    }
    const old = await encode({ secret: development.env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: DEV_ADMIN_ID, local_test: true } });
    expect(await (await development.request("/api/me", { headers: { cookie: `authjs.session-token=${old}` } })).json()).toEqual({ user: null });
    const unmarked = await encode({ secret: production.env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: DEV_ADMIN_ID } });
    expect(await (await production.request("/api/me", { headers: { cookie: `authjs.session-token=${unmarked}` } })).json()).toEqual({ user: null });
  } finally { development.db.close(); production.db.close(); }
});
