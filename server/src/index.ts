import { Hono } from "hono";
import { Auth } from "@auth/core";
import type { Bindings, Variables } from "./types";
import { authConfig } from "./auth";
import { getSessionUser } from "./middleware/auth";
import { itemsRoute } from "./routes/items";
import { meRoute } from "./routes/me";
import { reservationsRoute } from "./routes/reservations";
import { adminItemsRoute } from "./routes/admin/items";
import { adminMembersRoute } from "./routes/admin/members";
import { adminReservationsRoute } from "./routes/admin/reservations";
import { adminDashboardRoute } from "./routes/admin/dashboard";
import { adminHistoryRoute } from "./routes/admin/history";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --- 헬스체크 ---
app.get("/api/health", (c) => c.json({ ok: true }));

// --- 인증 (Auth.js — §7.2) ---
// signin/callback/signout 전부 Auth.js가 처리 (full-page redirect 방식)
app.all("/api/auth/*", (c) => Auth(c.req.raw, authConfig(c.env)));

// --- 세션 ---
// 401 대신 {user:null} 반환 — SPA가 로그인 상태를 판단
app.get("/api/me", async (c) => {
  const user = await getSessionUser(c);
  return c.json({ user });
});

// --- 사진 서빙 (R2) ---
// 키에 UUID가 포함되어 불변 → 1년 캐시. /api/*는 run_worker_first로 워커가 처리 (§7.5)
app.get("/api/photos/*", async (c) => {
  const key = c.req.path.slice("/api/photos/".length);
  if (!key || key.includes("..")) return c.json({ error: "bad_key" }, 400);
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

// --- 도메인 라우트 ---
app.route("/api/items", itemsRoute);
app.route("/api/me/profile", meRoute);
app.route("/api/reservations", reservationsRoute);
app.route("/api/admin/items", adminItemsRoute);
app.route("/api/admin/members", adminMembersRoute);
app.route("/api/admin/reservations", adminReservationsRoute);
app.route("/api/admin/dashboard", adminDashboardRoute);
app.route("/api/admin/history", adminHistoryRoute);

// --- 에러 처리 ---
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
