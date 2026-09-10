import { Hono } from 'hono'
import type { Bindings, Variables } from '../../types'
import { getDb, type Sql } from '../../db'
import { requireManager } from '../../middleware/auth'

// SPEC §4.4 — 관리자 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수 (manager 이상)
export const adminDashboardRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

adminDashboardRoute.use('*', requireManager)

type Row = {
  id: number
  item_id: number
  item_name: string
  member_name: string
  member_phone: string | null
  start_date: string
  end_date: string
}

type Counts = { pending_count: number; pickups_count: number; returns_count: number; overdue_count: number }

// CURRENT_DATE는 UTC — KST 오전 9시 전 하루 차이는 items.ts 가용 배지와 같이 수용된 관례
adminDashboardRoute.get('/', async (c) => {
  const db: Sql = getDb(c.env)

  // 카운트 1개 문장 집계 + 리스트 3개 — neon HTTP 드라이버는 쿼리당 1 request라 병렬 실행
  // (db.query 반환 타입이 유니온이라 결과별로 이중 캐스트)
  const [counts, pickups, returns, overdue] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
              COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= CURRENT_DATE)::int AS pickups_count,
              COUNT(*) FILTER (WHERE status = 'picked_up' AND end_date = CURRENT_DATE)::int AS returns_count,
              COUNT(*) FILTER (WHERE status = 'picked_up' AND end_date < CURRENT_DATE)::int AS overdue_count
         FROM reservations`,
    ) as unknown as Promise<Counts[]>,
    // 수령 예정 — 승인됐는데 아직 수령 전 (오늘 포함, 기한 지난 미수령 포함)
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'approved' AND r.start_date <= CURRENT_DATE
        ORDER BY r.start_date, r.id
        LIMIT 20`,
    ) as unknown as Promise<Row[]>,
    // 반납 예정 — 오늘이 반납 기한 (기한 지남은 연체 리스트로 분리 — is_overdue 정의와 동일 기준)
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'picked_up' AND r.end_date = CURRENT_DATE
        ORDER BY r.end_date, r.id
        LIMIT 20`,
    ) as unknown as Promise<Row[]>,
    // 연체 — 반납 기한 지남, 경과일 포함
    db.query(
      `SELECT r.id, r.item_id, items.name AS item_name, m.name AS member_name, m.phone AS member_phone,
              r.start_date::text AS start_date, r.end_date::text AS end_date,
              (CURRENT_DATE - r.end_date)::int AS days_late
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'picked_up' AND r.end_date < CURRENT_DATE
        ORDER BY r.end_date, r.id
        LIMIT 20`,
    ) as unknown as Promise<(Row & { days_late: number })[]>,
  ])

  return c.json({
    pending_count: counts[0]?.pending_count ?? 0,
    pickups_count: counts[0]?.pickups_count ?? 0,
    returns_count: counts[0]?.returns_count ?? 0,
    overdue_count: counts[0]?.overdue_count ?? 0,
    pickups,
    returns,
    overdue,
  })
})
