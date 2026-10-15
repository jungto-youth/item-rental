import { test, assert } from "vitest";
const { deepEqual: assertEquals, match: assertMatch } = assert;
import { MAX_API_BODY_BYTES, MAX_PHOTO_BODY_BYTES, canonicalAuthRequest } from "../src/middleware/security.ts";
import { authConfig } from "../src/auth.ts";
import { httpFixture, PNG, TEST_ORIGIN } from "./_http.fixture.ts";

test("API security: OAuth authority is taken from the URL, not attacker-supplied forwarded headers", () => {
  const request = canonicalAuthRequest(new Request("https://service.example/api/auth/csrf", {
    headers: { host: "attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" },
  }));
  assertEquals(request.headers.get("host"), "service.example");
  assertEquals(request.headers.get("x-forwarded-host"), null);
  assertEquals(request.headers.get("x-forwarded-proto"), "https");
});

test("API security: malformed cookies are anonymous rather than 500", async () => {
  const { db, request } = httpFixture();
  try {
    for (const cookie of ["authjs.session-token=%", "authjs.session-token=%ZZ", "__Secure-authjs.session-token=%E0%A4%A", "authjs.session-token=not-a-jwt"]) {
      const me = await request("/api/me", { headers: { cookie } });
      assertEquals(me.status, 200);
      assertEquals(await me.json(), { user: null });
      assertEquals((await request("/api/admin/items", { headers: { cookie } })).status, 401);
    }
  } finally { db.close(); }
});

test("API security: state changes require exact origin, including scheme, without trusting Host overrides", async () => {
  const { db, request, cookie } = httpFixture();
  try {
    const session = await cookie("member");
    for (const origin of [undefined, "null", "http://evil.example", "https://localhost:8787", TEST_ORIGIN + "/path"]) {
      const headers = new Headers({ cookie: session, host: "evil.example", "x-forwarded-host": "evil.example" });
      if (origin !== undefined) headers.set("origin", origin);
      assertEquals((await request("/api/me/profile", { method: "PUT", headers, body: '{"name":"changed","phone":"010-1111-2222"}' })).status, 403);
    }
    const good = await request("/api/me/profile", { method: "PUT", headers: { origin: TEST_ORIGIN, cookie: session }, body: '{"name":"allowed","phone":"010-1111-2222"}' });
    assertEquals(good.status, 200);
    assertEquals(db.prepare("SELECT name FROM members WHERE id = 'member'").get()?.name, "allowed");
  } finally { db.close(); }
});

test("API security: actual body bytes are capped before parsing even with absent/false Content-Length", async () => {
  const { db, request, statements } = httpFixture();
  try {
    for (const claimed of [undefined, "1", String(MAX_API_BODY_BYTES + 1)]) {
      const headers = new Headers({ origin: TEST_ORIGIN });
      if (claimed !== undefined) headers.set("content-length", claimed);
      assertEquals((await request("/api/reservations", { method: "POST", headers, body: new Uint8Array(MAX_API_BODY_BYTES + 1) })).status, 413);
    }
    const upload = await request("/api/admin/items/1/photos", {
      method: "POST", headers: { origin: TEST_ORIGIN, "content-length": "1", "content-type": "multipart/form-data; boundary=invalid" },
      body: new Uint8Array(MAX_PHOTO_BODY_BYTES + 1),
    });
    assertEquals(upload.status, 413);
    assertEquals(statements.length, 0);
    assertEquals(upload.headers.get("cache-control"), "no-store");
  } finally { db.close(); }
});

test("API security: personalized responses are not cacheable and authenticated search input is bounded", async () => {
  const { db, request, cookie, statements } = httpFixture();
  try {
    const session = await cookie("admin", "admin");
    for (const path of ["/api/me", "/api/admin/members", "/api/admin/allowed-emails"]) {
      const res = await request(path, { headers: { cookie: session } });
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("cache-control"), "private, no-store");
      assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    }
    statements.length = 0;
    assertEquals((await request("/api/items?q=" + "a".repeat(513), { headers: { cookie: session } })).status, 400);
    assertEquals(statements.length, 1); // Only the current-member lookup precedes search validation.
  } finally { db.close(); }
});

test("API security: Google sign-in requires verified email before allow-list/domain checks", async () => {
  const { db, env } = httpFixture();
  try {
    env.AUTH_ALLOWED_EMAILS = "approved@example.net";
    const signIn = authConfig(env).callbacks!.signIn!;
    for (const email of ["member@jungto.org", "approved@example.net"]) {
      for (const verified of [undefined, false, null]) {
        assertEquals(await signIn({ user: { id: "google", email }, account: null, profile: { email_verified: verified } }), false);
      }
    }
    assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 0);
    assertEquals(await signIn({ user: { id: "google", email: "member@jungto.org", name: "회원" }, account: null, profile: { email_verified: true } }), true);
    assertEquals(await signIn({ user: { id: "google", email: "outsider@example.net" }, account: null, profile: { email_verified: true } }), false);
    assertEquals(db.prepare("SELECT COUNT(*) AS n FROM members").get()?.n, 1);
  } finally { db.close(); }
});

test("API security: photo upload verifies permission and detected MIME; authenticated photo GET scopes R2 and stays private", async () => {
  const { db, request, cookie, objects } = httpFixture();
  try {
    db.prepare("INSERT INTO items (id, name) VALUES (1, '사진 검사')").run();
    const user = await cookie("user");
    const admin = await cookie("admin", "admin");
    for (const session of [undefined, user]) {
      const form = new FormData(); form.set("file", new File([PNG], "photo.png", { type: "image/png" }));
      const headers = new Headers({ origin: TEST_ORIGIN }); if (session) headers.set("cookie", session);
      assertEquals((await request("/api/admin/items/1/photos", { method: "POST", headers, body: form })).status, session ? 403 : 401);
    }
    const mismatch = new FormData(); mismatch.set("file", new File([PNG], "pretend.jpg", { type: "image/jpeg" }));
    assertEquals((await request("/api/admin/items/1/photos", { method: "POST", headers: { origin: TEST_ORIGIN, cookie: admin }, body: mismatch })).status, 400);
    assertEquals(objects.size, 0);
    const valid = new FormData(); valid.set("file", new File([PNG], "photo.png", { type: "image/png" }));
    const created = await request("/api/admin/items/1/photos", { method: "POST", headers: { origin: TEST_ORIGIN, cookie: admin }, body: valid });
    assertEquals(created.status, 201);
    const { url } = await created.json() as { url: string };
    const photo = await request(url, { headers: { cookie: user } });
    assertEquals(photo.status, 200);
    assertEquals(photo.headers.get("content-type"), "image/png");
    assertMatch(photo.headers.get("cache-control")!, /private.*no-store/);
    objects.set("backups/private.sql", { bytes: new Uint8Array(), type: "application/sql" });
    assertEquals((await request("/api/photos/backups/private.sql", { headers: { cookie: user } })).status, 400);
    objects.set("items/1/wrong.png", { bytes: new Uint8Array(), type: "text/html" });
    assertEquals((await request("/api/photos/items/1/wrong.png", { headers: { cookie: user } })).status, 404);
  } finally { db.close(); }
});
