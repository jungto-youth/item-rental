import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireManager } from "../../middleware/auth";

// SPEC §4.3 — 과거 대여 이력 조회 (manager 이상)
// 2025 청년페스타 '물품대여' 시트 스냅샷이라 운영 큐(reservations)와 분리돼 있다.
// 왜 별도 테이블인지는 migrations/0012_rental_history.sql 참고.
// 참고 자료이므로 수정·상태 전이 API 를 두지 않는다 — 조회 전용이다.
export const adminHistoryRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminHistoryRoute.use("*", requireManager);

// 시트의 '청년/회관물품' 구분값 그대로. 이력에만 있는 분류라 items.kind(대여품/소모품)와 다르다
const SCOPES = ["청년물품", "회관물품"];
const MAX_LIMIT = 200;

// 검색 조건은 물품명·신청자·소속 세 곳 — 시트에 상품 ID 가 없어 이름 문자열이 유일한 연결고리다.
// LIST_SQL 과 COUNT_SQL 이 같은 FILTER 를 써야 '더 보기'가 정확히 끝난다.
const FILTER = `WHERE ($1::text IS NULL OR item_name ILIKE '%' || $1::text || '%'
                             OR member_name ILIKE '%' || $1::text || '%'
                             OR COALESCE(org, '') ILIKE '%' || $1::text || '%')
                  AND ($2::text IS NULL OR item_scope = $2::text)`;

// 날짜·시각은 ::text 로 내보낸다 — date/timestamp 를 그대로 주면 드라이버가 JS Date 로
// 바꾸면서 시간대를 섞어 하루가 밀린다(예: 2025-10-20 → 2025-10-19T15:00:00Z).
// return_state 는 시트가 빈칸이라 전부 NULL — 내려주지 않는다.
const LIST_SQL = `SELECT id, source_row, item_name, item_id, item_scope, member_name, org, qty,
                         requested_on::text AS requested_on,
                         start_at::text AS start_at, end_at::text AS end_at,
                         use_location, procurement, checkout_state, note
                    FROM rental_history
                    ${FILTER}
                   ORDER BY requested_on DESC NULLS LAST, id
                   LIMIT $3 OFFSET $4`;

const COUNT_SQL = `SELECT COUNT(*)::int AS n FROM rental_history ${FILTER}`;

adminHistoryRoute.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const scope = c.req.query("scope") || null;
  if (scope && !SCOPES.includes(scope))
    return c.json({ error: "bad_scope" }, 400);

  // 정수만 통과시킨다 — NaN 이 SQL 로 흘러가면 LIMIT 의 의미가 흐려진다
  const limit = Math.min(
    Math.max(Math.trunc(Number(c.req.query("limit"))) || 50, 1),
    MAX_LIMIT,
  );
  const page = Math.max(Math.trunc(Number(c.req.query("page"))) || 1, 1);

  const db: Sql = getDb(c.env);
  const rows = await db.query(LIST_SQL, [
    q || null,
    scope,
    limit,
    (page - 1) * limit,
  ]);
  const total = (await db.query(COUNT_SQL, [q || null, scope])) as {
    n: number;
  }[];

  return c.json({ rows, total: total[0].n, page, limit });
});
