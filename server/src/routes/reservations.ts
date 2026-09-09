import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'
import { requireApproved } from '../middleware/auth'

// SPEC §3·§7.4 — 대여 신청/내 예약/취소 (approved 회원 전용, §8)
export const reservationsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

reservationsRoute.use('*', requireApproved)

// 날짜 검증 — YYYY-MM-DD 형식 + 실존하는 날짜(2026-02-30 등 차단)
function isDateStr(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
  )
}

// 신청 — 가용 검사를 INSERT와 한 문장으로 처리 (§8 원자성 — 동시 신청에도 이중 예약 불가)
reservationsRoute.post('/', async (c) => {
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  const itemId = Number(body.item_id)
  if (!Number.isInteger(itemId)) return c.json({ error: 'bad_id' }, 400)
  const { start_date, end_date } = body
  if (!isDateStr(start_date) || !isDateStr(end_date)) return c.json({ error: 'bad_date' }, 400)

  // 반개구간 [start, end) — end_date는 반납일이며 대여일에서 제외 (§8 겹침 조건과 동일 기준)
  const days = Math.round((Date.parse(end_date) - Date.parse(start_date)) / 86400000)
  if (days < 1) return c.json({ error: 'bad_range' }, 400)
  const today = new Date().toISOString().slice(0, 10)
  if (start_date < today) return c.json({ error: 'past_date' }, 400)
  const memo =
    typeof body.memo === 'string' && body.memo.trim() ? body.memo.trim().slice(0, 500) : null

  const db: Sql = getDb(c.env)

  // 사전 검사 — 오류 코드 구분용 (가용성은 아래 단일 문장이 보장)
  const [item] = (await db.query('SELECT id, status, max_days FROM items WHERE id = $1', [
    itemId,
  ])) as { id: number; status: string; max_days: number }[]
  if (!item) return c.json({ error: 'not_found' }, 404)
  if (item.status !== 'active') return c.json({ error: 'item_not_active' }, 409)
  if (days > item.max_days) return c.json({ error: 'too_long' }, 400)

  const inserted = (await db.query(
    `INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo)
     SELECT $1, $2, $3, $4, $5
     WHERE (
       (SELECT items.total_qty FROM items WHERE items.id = $1)
       - (
         SELECT COUNT(*)
         FROM reservations
         WHERE reservations.item_id = $1
           AND reservations.status IN ('pending','approved','picked_up')
           AND reservations.start_date < $4::date
           AND reservations.end_date > $3::date
       )
     ) > 0
     RETURNING id`,
    [itemId, user.id, start_date, end_date, memo],
  ).catch((err: { code?: string }) => {
    // 신청 사이 물품 삭제 — FK 위반을 404로 흡수
    if (err.code === '23503') return []
    throw err
  })) as { id: number }[]
  if (inserted.length === 0) return c.json({ error: 'no_availability' }, 409)

  return c.json({ id: inserted[0].id }, 201)
})

// 내 예약 현황·이력 — §4.1 (member_id = 세션 사용자 필수, §8)
reservationsRoute.get('/mine', async (c) => {
  const user = c.get('user')!
  const db: Sql = getDb(c.env)
  const rows = await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || p.r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.start_date::text AS start_date, r.end_date::text AS end_date,
            r.status, r.status_note, r.member_memo,
            (r.status = 'picked_up' AND r.end_date < CURRENT_DATE) AS is_overdue,
            r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = $1
      ORDER BY r.created_at DESC`,
    [user.id],
  )
  return c.json({ reservations: rows })
})

// 신청 취소 — 본인 + 수령 전(pending/approved)만 (§3)
reservationsRoute.post('/:id/cancel', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)

  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE reservations SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND member_id = $2 AND status IN ('pending','approved')
      RETURNING id`,
    [id, user.id],
  )) as { id: number }[]
  if (rows.length === 0) {
    // 없음/타인 건 → not_found, 종료 상태 → bad_status 구분
    const found = (await db.query('SELECT member_id, status FROM reservations WHERE id = $1', [
      id,
    ])) as { member_id: string; status: string }[]
    if (found.length === 0 || found[0].member_id !== user.id) {
      return c.json({ error: 'not_found' }, 404)
    }
    return c.json({ error: 'bad_status' }, 409)
  }
  return c.json({ ok: true })
})
