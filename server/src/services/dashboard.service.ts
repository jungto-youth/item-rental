// 대시보드 서비스 — 오늘 수령/반납 예정, 승인 대기·연체 건수와 목록 (SPEC §4.4)
import type { Sql } from "../db";
import { KST_TODAY } from "../dates";

type Row = {
  id: number;
  item_id: number;
  item_name: string;
  member_name: string;
  member_phone: string | null;
  start_date: string;
  end_date: string;
  // 부분 대여 수량 (§3) — 수령·반납 목록에서 실제로 챙길 개수
  qty: number;
};

type Counts = {
  pending_count: number;
  pickups_count: number;
  returns_count: number;
  overdue_count: number;
};

// '오늘' 판정은 KST 자정 기준(dates.ts KST_TODAY) — CURRENT_DATE(UTC)는 KST 오전 9시까지 어제로 보인다
export async function getDashboard(db: Sql) {
  // 카운트 1개 문장 집계 + 리스트 3개 — neon HTTP 드라이버는 쿼리당 1 request라 병렬 실행
  const [countsRaw, pickupsRaw, returnsRaw, overdueRaw] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
              COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= ${KST_TODAY})::int AS pickups_count,
              COUNT(*) FILTER (WHERE status = 'picked_up' AND end_date = ${KST_TODAY})::int AS returns_count,
              COUNT(*) FILTER (WHERE status = 'picked_up' AND end_date < ${KST_TODAY})::int AS overdue_count
         FROM reservations`,
    ),
    // 수령 예정 — 승인됐는데 아직 수령 전 (오늘 포함, 기한 지난 미수령 포함)
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date,
              r.qty
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'approved' AND r.start_date <= ${KST_TODAY}
        ORDER BY r.start_date, r.id
        LIMIT 20`,
    ),
    // 반납 예정 — 오늘이 반납 기한 (기한 지남은 연체 리스트로 분리 — is_overdue 정의와 동일 기준)
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date,
              r.qty
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'picked_up' AND r.end_date = ${KST_TODAY}
        ORDER BY r.end_date, r.id
        LIMIT 20`,
    ),
    // 연체 — 반납 기한 지남, 경과일 포함
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date,
              r.qty,
              (${KST_TODAY} - r.end_date)::int AS days_late
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'picked_up' AND r.end_date < ${KST_TODAY}
        ORDER BY r.end_date, r.id
        LIMIT 20`,
    ),
  ]);

  // SAFETY: 각 raw 쿼리의 SELECT 목록이 아래 Row/Counts 타입과 일치한다. neon HTTP
  // 드라이버의 반환형이 유니온이라 단언이 필요한데, tsc는 SELECT 문자열을 읽지 못해
  // 이 일치를 검사할 수 없다.
  const counts = countsRaw as unknown as Counts[];
  // SAFETY: pickups 쿼리의 SELECT 목록이 Row와 일치한다 (수령 예정 목록).
  const pickups = pickupsRaw as unknown as Row[];
  // SAFETY: returns 쿼리의 SELECT 목록이 Row와 일치한다 (반납 예정 목록).
  const returns = returnsRaw as unknown as Row[];
  // SAFETY: overdue 쿼리의 SELECT 목록이 Row + days_late와 일치한다 (연체 목록).
  const overdue = overdueRaw as unknown as (Row & { days_late: number })[];

  const c0 = counts[0];
  // LIMIT 20으로 잘렸으면 목록에 표시가 없어 조용히 누락된다 — 전체 건수 대비 절단 여부를 내려준다
  const trunc = (n: number, count: number) => n === 20 && count > 20;
  return {
    pending_count: c0?.pending_count ?? 0,
    pickups_count: c0?.pickups_count ?? 0,
    returns_count: c0?.returns_count ?? 0,
    overdue_count: c0?.overdue_count ?? 0,
    pickups,
    returns,
    overdue,
    pickups_truncated: trunc(pickups.length, c0?.pickups_count ?? 0),
    returns_truncated: trunc(returns.length, c0?.returns_count ?? 0),
    overdue_truncated: trunc(overdue.length, c0?.overdue_count ?? 0),
  };
}
