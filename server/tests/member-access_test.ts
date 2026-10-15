import { test, expect } from "vitest";
import { authConfig } from "../src/auth.ts";
import { httpFixture, TEST_ORIGIN } from "./_http.fixture.ts";

const inventoryPaths = ["/api/items", "/api/items/1", "/api/items?q=", "/api/categories", "/api/photos/items/1/fixture.png", "/api/photos/items/1/fixture.png?access=members"];

test("inventory: anonymous, forged, deactivated and deleted sessions cannot read inventory or photo bytes", async () => {
  const fixture = httpFixture();
  const { db, request, member } = fixture;
  try {
    const inactive = await member("inactive", "user", true);
    const removed = await member("removed");
    db.prepare("DELETE FROM members WHERE id = 'removed'").run();
    const anonymized = await member("anonymized");
    db.prepare("UPDATE members SET registration_deleted_at = '2026-01-01' WHERE id = 'anonymized'").run();
    for (const cookie of [undefined, "authjs.session-token=forged", "authjs.session-token=%", inactive, removed, anonymized]) {
      for (const path of inventoryPaths) {
        const response = await request(path, cookie ? { headers: { cookie } } : undefined);
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toContain("no-store");
      }
    }
    expect(fixture.photoReads).toBe(0);
    expect((await request("/api/health")).status).toBe(200);
    expect(await (await request("/api/me")).json()).toEqual({ user: null });
  } finally { db.close(); }
});

test("inventory: active members can read, responses are private and generated photo URLs bypass former public cache entries", async () => {
  const { db, request, member } = httpFixture();
  try {
    const cookie = await member("active");
    db.exec("INSERT INTO items (id, name) VALUES (1, '회원 물품'); INSERT INTO item_photos (item_id, r2_key, sort_order) VALUES (1, 'items/1/fixture.png', 1);");
    for (const path of inventoryPaths) {
      const response = await request(path, { headers: { cookie } });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toBe("Cookie");
    }
    const result = await (await request("/api/items/1", { headers: { cookie } })).json() as { item: { photos: { url: string }[] } };
    expect(result.item.photos[0].url).toBe("/api/photos/items/1/fixture.png?access=members");
  } finally { db.close(); }
});

test("membership: admin withdrawal immediately revokes an existing session including direct photo access", async () => {
  const fixture = httpFixture();
  const { db, request, member } = fixture;
  try {
    const admin = await member("admin", "admin");
    const user = await member("user");
    expect((await request("/api/items", { headers: { cookie: user } })).status).toBe(200);
    expect((await request("/api/admin/members/user/withdraw", { method: "POST", headers: { origin: TEST_ORIGIN, cookie: admin } })).status).toBe(200);
    for (const path of inventoryPaths) expect((await request(path, { headers: { cookie: user } })).status).toBe(401);
    expect(fixture.photoReads).toBe(0);
    expect(await (await request("/api/me", { headers: { cookie: user } })).json()).toEqual({ user: null });
    const signIn = authConfig(fixture.env).callbacks!.signIn!;
    expect(await signIn({ user: { id: "google-user", email: "user@jungto.org" }, account: null })).toBe("/login?error=AccountDeactivated");
  } finally { db.close(); }
});

test("registration removal: anonymizes inactive accounts, hides them from members, and permits fresh registration without reviving old tokens", async () => {
  const fixture = httpFixture();
  const { db, request, member } = fixture;
  try {
    const admin = await member("admin", "admin");
    const user = await member("user");
    const oldSession = await member("reset", "user", true);
    const headers = { origin: TEST_ORIGIN, cookie: admin };
    expect((await request("/api/admin/members/reset", { method: "DELETE", headers: { origin: TEST_ORIGIN } })).status).toBe(401);
    expect((await request("/api/admin/members/reset", { method: "DELETE", headers: { origin: TEST_ORIGIN, cookie: user } })).status).toBe(403);
    expect((await request("/api/admin/members/user", { method: "DELETE", headers })).status).toBe(409);
    expect((await request("/api/admin/members/reset", { method: "DELETE", headers })).status).toBe(200);
    const old = db.prepare("SELECT email, name, phone, role, deactivated_at, registration_deleted_at FROM members WHERE id = 'reset'").get();
    expect(old?.email).not.toBe("reset@jungto.org");
    expect(old?.name).toBe("삭제된 회원");
    expect(old?.phone).toBeNull();
    expect(old?.role).toBe("user");
    expect(old?.deactivated_at).not.toBeNull();
    expect(old?.registration_deleted_at).not.toBeNull();
    const list = await (await request("/api/admin/members", { headers: { cookie: admin } })).json() as { members: { id: string }[] };
    expect(list.members.some(m => m.id === "reset")).toBe(false);
    const signIn = authConfig(fixture.env).callbacks!.signIn!;
    expect(await signIn({ user: { id: "google-reset", email: "reset@jungto.org", name: "새 회원" }, account: null })).toBe(true);
    const fresh = db.prepare("SELECT id, role, phone, deactivated_at FROM members WHERE email = 'reset@jungto.org'").get();
    expect(fresh?.id).not.toBe("reset");
    expect(fresh?.role).toBe("user");
    expect(fresh?.phone).toBeNull();
    expect(fresh?.deactivated_at).toBeNull();
    expect((await request("/api/items", { headers: { cookie: oldSession } })).status).toBe(401);
    expect((await request("/api/admin/members/reset", { method: "DELETE", headers })).status).toBe(404);
  } finally { db.close(); }
});

test("registration removal: completed borrower/admin history is preserved while the last active administrator stays protected", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    await member("borrower", "user", true);
    await member("processor", "admin", true);
    await member("other");
    db.exec("INSERT INTO items (id, name) VALUES (1, '이력 물품'); INSERT INTO reservations (item_id, member_id, admin_id, status) VALUES (1, 'borrower', 'processor', 'returned');");
    const headers = { origin: TEST_ORIGIN, cookie: admin };
    for (const id of ["borrower", "processor"]) {
      const response = await request(`/api/admin/members/${id}`, { method: "DELETE", headers });
      expect(response.status).toBe(200);
      expect(db.prepare("SELECT name FROM members WHERE id = ?1").get(id)?.name).toBe("삭제된 회원");
    }
    const history = db.prepare("SELECT member_id, admin_id, status FROM reservations").get();
    expect(history).toMatchObject({ member_id: "borrower", admin_id: "processor", status: "returned" });
    const result = await (await request("/api/admin/reservations", { headers: { cookie: admin } })).json() as { reservations: { member_name: string; admin_name: string; returned_by_member: boolean }[] };
    expect(result.reservations[0]).toMatchObject({ member_name: "삭제된 회원", admin_name: "삭제된 회원", returned_by_member: false });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const last = await request("/api/admin/members/admin/withdraw", { method: "POST", headers });
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: "last_admin" });
    expect((await request("/api/admin/members/admin", { method: "DELETE", headers })).status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations").get()?.n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM members WHERE role = 'admin' AND deactivated_at IS NULL").get()?.n).toBe(1);
  } finally { db.close(); }
});

test("registration removal: active rentals block all profile changes until returned or cancelled", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    await member("busy", "user", true);
    db.exec("UPDATE members SET phone = '010-0000-0000' WHERE id = 'busy'; INSERT INTO items (id, name, total_qty) VALUES (1, '대여 중 물품', 3); INSERT INTO reservations (item_id, member_id, status, qty) VALUES (1, 'busy', 'rented', 2);");
    const headers = { origin: TEST_ORIGIN, cookie: admin };
    const before = db.prepare("SELECT * FROM members WHERE id = 'busy'").get();
    const blocked = await request("/api/admin/members/busy", { method: "DELETE", headers });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "has_active_rentals" });
    expect(db.prepare("SELECT * FROM members WHERE id = 'busy'").get()).toEqual(before);
    expect(db.prepare("SELECT SUM(qty) AS n FROM reservations WHERE status = 'rented'").get()?.n).toBe(2);
    const members = await (await request("/api/admin/members", { headers: { cookie: admin } })).json() as { members: { id: string; active_rental_count: number }[] };
    expect(members.members.find(m => m.id === "busy")?.active_rental_count).toBe(1);
    db.prepare("UPDATE reservations SET status = 'returned', admin_id = 'admin' WHERE member_id = 'busy'").run();
    expect((await request("/api/admin/members/busy", { method: "DELETE", headers })).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations").get()?.n).toBe(1);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    await member("cancelled", "user", true);
    db.prepare("INSERT INTO reservations (item_id, member_id, status) VALUES (1, 'cancelled', 'cancelled')").run();
    expect((await request("/api/admin/members/cancelled", { method: "DELETE", headers })).status).toBe(200);
  } finally { db.close(); }
});
