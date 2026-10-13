import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { encode } from "@auth/core/jwt";
import { getDb } from "../db";
import type { Bindings, Variables } from "../types";
import { localTestLoginEnabled } from "../local-test-login";
import { ensureLocalTestAdmin } from "../services/members.service";

export const devLoginRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

devLoginRoute.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ enabled: localTestLoginEnabled(c.req.raw) });
});

devLoginRoute.post("/", async (c) => {
  if (!localTestLoginEnabled(c.req.raw)) return c.json({ error: "not_found" }, 404);
  // Require a same-origin browser POST; a cross-site page cannot create this session.
  const origin = new URL(c.req.url).origin;
  if (c.req.header("origin") !== origin) return c.json({ error: "bad_origin" }, 403);
  const id = await ensureLocalTestAdmin(getDb(c.env));
  const secure = new URL(c.req.url).protocol === "https:";
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const maxAge = 8 * 60 * 60;
  const token = await encode({
    secret: c.env.AUTH_SECRET,
    salt: cookieName,
    maxAge,
    token: { sub: id, local_test: true },
  });
  setCookie(c, cookieName, token, { httpOnly: true, sameSite: "Lax", path: "/", secure, maxAge });
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true });
});
