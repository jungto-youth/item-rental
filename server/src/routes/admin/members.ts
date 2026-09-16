import { Hono } from "hono";
import type { Bindings, Role } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireManager, requireAdmin } from "../../middleware/auth";
import {
  listMembers,
  approveMember,
  rejectMember,
  deactivateMember,
  setMemberRole,
} from "../../services/members.service";

// SPEC §4.4 — 회원 관리
// 목록·승인/거절은 manager 이상, 역할 지정/해제는 admin(총관리자) 전용
export const adminMembersRoute = new Hono<{ Bindings: Bindings }>();

adminMembersRoute.use("*", requireManager);

// 회원 목록 — 승인 대기가 맨 위, 그 뒤 최근 가입순
adminMembersRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const members = await listMembers(db);
  return c.json({ members });
});

// 승인 — pending → approved
adminMembersRoute.post("/:id/approve", async (c) => {
  const db: Sql = getDb(c.env);
  const result = await approveMember(db, c.req.param("id"));
  if ("ok" in result) return c.json({ ok: true });
  return c.json({ error: "not_found" }, 404);
});

// 거절 — pending → inactive (이력 보존을 위해 삭제하지 않음, §4.1)
adminMembersRoute.post("/:id/reject", async (c) => {
  const db: Sql = getDb(c.env);
  const result = await rejectMember(db, c.req.param("id"));
  if ("ok" in result) return c.json({ ok: true });
  return c.json({ error: "not_found" }, 404);
});

// 탈퇴(비활성화) — 관리자가 활성 회원을 비활성화한다. 소프트 삭제 — 대여 이력 보존(§4.1, v3.1)
adminMembersRoute.post("/:id/deactivate", async (c) => {
  const db: Sql = getDb(c.env);
  const result = await deactivateMember(db, c.req.param("id"));
  if ("ok" in result) return c.json({ ok: true });
  if (result.error === "last_admin")
    return c.json({ error: "last_admin" }, 409);
  return c.json({ error: "not_found" }, 404);
});

// 역할 지정/해제 — 총관리자 전용 (v2.7)
adminMembersRoute.put("/:id/role", requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: Role };
  const role = body.role;
  if (!role || (role !== "user" && role !== "manager" && role !== "admin")) {
    return c.json({ error: "bad_role" }, 400);
  }
  const db: Sql = getDb(c.env);
  const memberId = c.req.param("id") ?? "";
  const result = await setMemberRole(db, memberId, role);
  if ("ok" in result) return c.json({ ok: true });
  // 승인 대기/비활성 회원에게 역할 부여 불가 — 승인 먼저
  if (result.error === "member_not_approved") {
    return c.json({ error: "member_not_approved" }, 409);
  }
  // 마지막 총관리자 보호 — 해임하면 역할 관리가 불가능해짐 (본인 포함)
  if (result.error === "last_admin")
    return c.json({ error: "last_admin" }, 409);
  return c.json({ error: "not_found" }, 404);
});
