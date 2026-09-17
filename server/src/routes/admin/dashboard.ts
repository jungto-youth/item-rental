import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import { getDashboard } from "../../services/dashboard.service";

// SPEC §4.4 — 관리자 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수 (admin 전용)
// 집계·목록 SQL 은 dashboard.service 가 소유
export const adminDashboardRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminDashboardRoute.use("*", requireAdmin);

adminDashboardRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  return c.json(await getDashboard(db));
});
