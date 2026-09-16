// 과거 대여 이력 조회 서비스 — 2025 청년페스타 '물품대여' 시트 스냅샷 (조회 전용)
// SPEC §4.3 — 운영 큐(reservations)와 분리된 참고 자료. 왜 별도 테이블인지는
// migrations/0012_rental_history.sql 참고. 수정·상태 전이 API 는 두지 않는다.
import type { Sql } from "../db";

// 시트의 '청년/회관물품' 구분값 그대로. 이력에만 있는 분류라 items.kind(대여품/소모품)와 다르다
export const HISTORY_SCOPES = ["청년물품", "회관물품"];
export const HISTORY_MAX_LIMIT = 200;

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

export async function searchHistory(
  db: Sql,
  q: string | null,
  scope: string | null,
  limit: number,
  offset: number,
) {
  const rows = await db.query(LIST_SQL, [q, scope, limit, offset]);
  const total = (await db.query(COUNT_SQL, [q, scope])) as { n: number }[];
  return { rows, total: total[0].n };
}
