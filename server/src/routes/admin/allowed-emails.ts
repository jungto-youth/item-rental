import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  addAllowedEmail,
  deleteAllowedEmail,
  listAllowedEmails,
  normalizeEmail,
} from "../../services/allowed-emails.service";

// SPEC §7.2 보조 — 로그인 허용 예외 이메일 관리 (admin 전용)
// 등록/제거는 어드민 화면에서, env 변수 AUTH_ALLOWED_EMAILS 는 비상용 폴백 (auth.ts)
export const adminAllowedEmailsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminAllowedEmailsRoute.use("*", requireAdmin);

// 허용 이메일 목록 — 최근 등록순
adminAllowedEmailsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const allowedEmails = await listAllowedEmails(db);
  return c.json({ allowedEmails });
});

// 추가 — 등록자는 현재 로그인한 관리자
adminAllowedEmailsRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    note?: string;
  };
  const email = normalizeEmail(body.email ?? "");
  if (!email || !email.includes("@")) {
    return c.json({ error: "bad_email" }, 400);
  }
  const db: Sql = getDb(c.env);
  const result = await addAllowedEmail(db, email, {
    note: body.note,
    createdBy: c.get("user")?.email,
  });
  if ("ok" in result) return c.json({ ok: true }, 201);
  return c.json({ error: "duplicate" }, 409);
});

// 제거
adminAllowedEmailsRoute.delete("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const result = await deleteAllowedEmail(db, c.req.param("id") ?? "");
  if ("ok" in result) return c.json({ ok: true });
  return c.json({ error: "not_found" }, 404);
});
