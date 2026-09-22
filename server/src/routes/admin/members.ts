import { Hono } from "hono";
import type { Bindings, Role } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  listMembers,
  withdrawMember,
  setMemberRole,
} from "../../services/members.service";

// 회원 관리 (admin 전용)
// 목록·탈퇴·역할 지정/해제 모두 admin만 사용
export const adminMembersRoute = new Hono<{ Bindings: Bindings }>();

adminMembersRoute.use("*", requireAdmin);

// 회원 목록 — 최근 가입순
adminMembersRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const members = await listMembers(db);
  return c.json({ members });
});

// 탈퇴 처리 — 관리자가 활성 회원을 탈퇴시킨다. 소프트 삭제 — 대여 이력 보존
adminMembersRoute.post("/:id/withdraw", async (c) => {
  const db: Sql = getDb(c.env);
  const result = await withdrawMember(db, c.req.param("id"));
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "last_admin")
    return c.json({ error: "last_admin" }, 409);
  return c.json({ error: "not_found" }, 404);
});

// 역할 지정/해제 — admin 전용: admin ↔ user 전환 (v3.2, 2단계)
adminMembersRoute.put("/:id/role", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: Role };
  const role = body.role;
  if (!role || (role !== "user" && role !== "admin")) {
    return c.json({ error: "bad_role" }, 400);
  }
  const db: Sql = getDb(c.env);
  const memberId = c.req.param("id") ?? "";
  const result = await setMemberRole(db, memberId, role);
  if ("ok" in result) return c.json({ ok: true });
  // 마지막 관리자 보호 — 해임하면 관리 기능 사용 불가 (본인 포함)
  if (result.error === "last_admin")
    return c.json({ error: "last_admin" }, 409);
  return c.json({ error: "not_found" }, 404);
});
