import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  answerInquiry,
  listInquiriesForAdmin,
} from "../../services/inquiries.service";

const ANSWER_MAX = 2_000;

// 문의 관리 — 관리자 전용. 목록·답변 등록/수정.
export const adminInquiriesRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminInquiriesRoute.use("*", requireAdmin);

adminInquiriesRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const inquiries = await listInquiriesForAdmin(db);
  return c.json({ inquiries });
});

adminInquiriesRoute.put("/:id/answer", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "bad_id" }, 400);
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer || answer.length > ANSWER_MAX) {
    return c.json({ error: "bad_answer" }, 400);
  }

  const db: Sql = getDb(c.env);
  const result = await answerInquiry(db, id, answer, c.get("user")!.id);
  if ("error" in result) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
