import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireManager } from "../../middleware/auth";
import {
  searchHistory,
  HISTORY_SCOPES,
  HISTORY_MAX_LIMIT,
} from "../../services/history.service";

// SPEC §4.3 — 과거 대여 이력 조회 (manager 이상)
// 2025 청년페스타 '물품대여' 시트 스냅샷이라 운영 큐(reservations)와 분리돼 있다.
// 왜 별도 테이블인지는 migrations/0012_rental_history.sql 참고.
// 참고 자료이므로 수정·상태 전이 API 를 두지 않는다 — 조회 전용이다.
export const adminHistoryRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminHistoryRoute.use("*", requireManager);

// 검색 조건은 물품명·신청자·소속 세 곳 — 시트에 상품 ID 가 없어 이름 문자열이 유일한 연결고리다.
adminHistoryRoute.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const scope = c.req.query("scope") || null;
  if (scope && !HISTORY_SCOPES.includes(scope))
    return c.json({ error: "bad_scope" }, 400);

  // 정수만 통과시킨다 — NaN 이 SQL 로 흘러가면 LIMIT 의 의미가 흐려진다
  const limit = Math.min(
    Math.max(Math.trunc(Number(c.req.query("limit"))) || 50, 1),
    HISTORY_MAX_LIMIT,
  );
  const page = Math.max(Math.trunc(Number(c.req.query("page"))) || 1, 1);

  const db: Sql = getDb(c.env);
  const { rows, total } = await searchHistory(
    db,
    q || null,
    scope,
    limit,
    (page - 1) * limit,
  );

  return c.json({ rows, total, page, limit });
});
