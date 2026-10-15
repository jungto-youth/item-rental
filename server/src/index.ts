import { Hono } from "hono";
import { Auth } from "@auth/core";
import type { Bindings, Variables } from "./types";
import { authConfig } from "./auth";
import { getSessionUser, requireAuth } from "./middleware/auth";
import { itemsRoute } from "./routes/items";
import { categoriesRoute } from "./routes/categories";
import { meRoute } from "./routes/me";
import { reservationsRoute } from "./routes/reservations";
import { adminItemsRoute } from "./routes/admin/items";
import { adminCategoriesRoute } from "./routes/admin/categories";
import { adminMembersRoute } from "./routes/admin/members";
import { adminAllowedEmailsRoute } from "./routes/admin/allowed-emails";
import { adminReservationsRoute } from "./routes/admin/reservations";
import { adminDashboardRoute } from "./routes/admin/dashboard";
import { adminReembedRoute } from "./routes/admin/reembed";
import { apiSecurityHeaders, guardApiRequest, canonicalAuthRequest } from "./middleware/security";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --- 공통 가드 ---
app.use("/api/*", apiSecurityHeaders, guardApiRequest);

// --- 헬스체크 ---
app.get("/api/health", (c) => c.json({ ok: true }));

// --- 인증 (Auth.js) ---
// signin/callback/signout 전부 Auth.js가 처리 (full-page redirect 방식)
// req를 넘겨 127.0.0.1 → localhost 정규화 (Google OAuth redirect_uri 등록 문제)
app.all("/api/auth/*", (c) => Auth(canonicalAuthRequest(c.req.raw), authConfig(c.env, c.req.raw)));

// --- 세션 ---
// 401 대신 {user:null} 반환 — SPA가 로그인 상태를 판단
app.get("/api/me", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const user = await getSessionUser(c);
  return c.json({ user });
});

// --- 사진 서빙 (R2) ---
// 사진도 매 요청에 최신 회원 상태를 확인한다. 로그아웃/탈퇴 이후 캐시로 우회하지 않는다.
app.get("/api/photos/*", requireAuth, async (c) => {
  const key = c.req.path.slice("/api/photos/".length);
  if (!/^items\/[1-9]\d*\/[^/]+\.(jpg|png|webp)$/.test(key) || key.includes("..")) return c.json({ error: "bad_key" }, 400);
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  if (!["image/jpeg", "image/png", "image/webp"].includes(obj.httpMetadata?.contentType ?? "")) return c.json({ error: "not_found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("vary", "Cookie");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", "inline");
  return new Response(obj.body, { headers });
});

// --- 도메인 라우트 ---
app.route("/api/items", itemsRoute);
app.route("/api/categories", categoriesRoute);
app.route("/api/me/profile", meRoute);
app.route("/api/reservations", reservationsRoute);
app.route("/api/admin/items", adminItemsRoute);
app.route("/api/admin/categories", adminCategoriesRoute);
app.route("/api/admin/members", adminMembersRoute);
app.route("/api/admin/allowed-emails", adminAllowedEmailsRoute);
app.route("/api/admin/reservations", adminReservationsRoute);
app.route("/api/admin/dashboard", adminDashboardRoute);
app.route("/api/admin/reembed-all", adminReembedRoute);

// --- 에러 처리 ---
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
