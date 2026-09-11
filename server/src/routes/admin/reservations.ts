import { Hono, type Context } from 'hono'
import type { Bindings, Variables } from '../../types'
import { getDb, type Sql } from '../../db'
import { requireManager } from '../../middleware/auth'

// SPEC §4.3 — 대여 신청 승인/거절/수령/반납 (manager 이상)
export const adminReservationsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

adminReservationsRoute.use('*', requireManager)

const STATUSES = ['pending', 'approved', 'picked_up', 'returned', 'rejected', 'cancelled']
type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>

// 조건부 전이 공용 처리 — 기대 상태가 아니면 빈 결과 → 없음(404) vs 잘못된 전이(409) 구분
async function finish(c: Ctx, id: number, rows: { id: number }[]): Promise<Response> {
  if (rows.length > 0) return c.json({ ok: true })
  const db: Sql = getDb(c.env)
  const found = (await db.query('SELECT id FROM reservations WHERE id = $1', [id])) as {
    id: number
  }[]
  if (found.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ error: 'bad_status' }, 409)
}

// 목록 — pending이 맨 위, 최근 신청순. pending 행의 초과 경고용 conflict_count 포함 (§3)
adminReservationsRoute.get('/', async (c) => {
  const status = c.req.query('status') || null
  if (status && !STATUSES.includes(status)) return c.json({ error: 'bad_status' }, 400)

  const db: Sql = getDb(c.env)
  const rows = await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name, items.total_qty,
            r.member_id, m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
            r.start_date::text AS start_date, r.end_date::text AS end_date,
            r.status, r.status_note, r.member_memo,
            (r.status = 'picked_up' AND r.end_date < CURRENT_DATE) AS is_overdue,
            -- 초과일 수 — 이 건을 승인하면 정원을 넘는 날. 신청 가드(v2.11)가 pending까지 일별
            -- 점유로 세므로 정상 흐름에선 항상 0이고, 0이 아니면 이상 상태(동시성 레이스나
            -- 운영진의 total_qty 인하)다. '확정 건과 겹치는 건수'가 아니다 — 수량 ≥ 2에선
            -- 같은 날 공존이 정상이라 그 기준은 매번 뜨는 무해한 소음이 된다 (§3)
            (SELECT COUNT(*)::int
               FROM generate_series(r.start_date, r.end_date - 1, interval '1 day') AS d(day)
              WHERE (SELECT COUNT(*) FROM reservations r2
                      WHERE r2.item_id = r.item_id AND r2.id <> r.id
                        AND r2.status IN ('approved','picked_up')
                        AND r2.start_date <= d.day::date AND r2.end_date > d.day::date
                    ) >= items.total_qty) AS conflict_count,
            a.name AS admin_name, r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN members a ON a.id = r.admin_id
      WHERE ($1::text IS NULL OR r.status = $1::text)
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 500`,
    [status],
  )
  return c.json({ reservations: rows })
})

// 승인 — pending → approved
adminReservationsRoute.post('/:id/approve', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)
  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE reservations SET status = 'approved', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, c.get('user')!.id],
  )) as { id: number }[]
  return finish(c, id, rows)
})

// 거절 — pending → rejected, 사유 필수 (§4.3)
adminReservationsRoute.post('/:id/reject', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!reason) return c.json({ error: 'reason_required' }, 400)

  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE reservations SET status = 'rejected', status_note = $2, admin_id = $3, updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, reason, c.get('user')!.id],
  )) as { id: number }[]
  return finish(c, id, rows)
})

// 수령 — approved → picked_up
adminReservationsRoute.post('/:id/pickup', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)
  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE reservations SET status = 'picked_up', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'approved' RETURNING id`,
    [id, c.get('user')!.id],
  )) as { id: number }[]
  return finish(c, id, rows)
})

// 반납 — picked_up → returned
adminReservationsRoute.post('/:id/return', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)
  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE reservations SET status = 'returned', admin_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'picked_up' RETURNING id`,
    [id, c.get('user')!.id],
  )) as { id: number }[]
  return finish(c, id, rows)
})
