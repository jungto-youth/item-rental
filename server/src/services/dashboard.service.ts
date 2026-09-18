// 대시보드 서비스 — 대여 중 목록과 건수 (SPEC §4.4)
//
// 날짜·기간이 없어져 '오늘 수령/반납 예정'과 '연체'를 계산할 수 없다. 대신 운영진이
// 실제로 챙겨야 하는 것 하나만 남긴다: 지금 나가 있는 물품과 그 수량.
import type { Sql } from "../db";

type Row = {
  id: number;
  item_id: number;
  item_name: string;
  member_name: string;
  member_phone: string | null;
  qty: number;
  created_at: string;
};

// 대여 중 목록 하드 리밋 — 넘으면 화면에 '상위 N건만' 안내를 띄운다
const RENTED_LIMIT = 50;

export async function getDashboard(db: Sql) {
  // 카운트 1개 문장 + 목록 1개 — neon HTTP 드라이버는 쿼리당 1 request라 병렬 실행
  const [countsRaw, rentedRaw] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'rented')::int AS rented_count,
              COUNT(*) FILTER (WHERE status = 'returned')::int AS returned_count,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count
         FROM reservations`,
    ),
    // 대여 중 — 오래된 것부터 (먼저 나간 물품이 먼저 돌아와야 한다)
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.qty, r.created_at
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'rented'
        ORDER BY r.created_at, r.id
        LIMIT ${RENTED_LIMIT}`,
    ),
  ]);

  // SAFETY: 각 raw 쿼리의 SELECT 목록이 아래 타입과 일치한다. neon HTTP 드라이버의
  // 반환형이 유니온이라 단언이 필요한데, tsc는 SELECT 문자열을 읽지 못해 이 일치를 검사할 수 없다.
  const counts = countsRaw as unknown as {
    rented_count: number;
    returned_count: number;
    cancelled_count: number;
  }[];
  // SAFETY: rented 쿼리의 SELECT 목록이 Row와 일치한다 (대여 중 목록).
  const rented = rentedRaw as unknown as Row[];

  const c0 = counts[0];
  const rentedCount = c0?.rented_count ?? 0;
  return {
    rented_count: rentedCount,
    returned_count: c0?.returned_count ?? 0,
    cancelled_count: c0?.cancelled_count ?? 0,
    rented,
    // LIMIT으로 잘렸으면 목록에 표시가 없어 조용히 누락된다 — 절단 여부를 내려준다
    rented_truncated: rented.length === RENTED_LIMIT && rentedCount > RENTED_LIMIT,
  };
}
