import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'

// SPEC §7.4 — GET /api/items, /api/items/:id (전체 열람 가능)
export const itemsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

type ListItemRow = {
  id: number
  name: string
  total_qty: number
  max_days: number
  status: 'active' | 'repair' | 'retired'
  category_id: number
  category_name: string
  photos: { id: number; url: string }[]
  active_now: number
}

// 목록 — 카테고리 필터 + 이름 검색 + 가용 배지 (§4.2)
itemsRoute.get('/', async (c) => {
  const db: Sql = getDb(c.env)
  const category = Number(c.req.query('category') ?? 0) || 0
  const q = (c.req.query('q') ?? '').trim()
  // CURRENT_DATE는 UTC 기준 — KST 0~9시 사이 하루 차이 가능하지만 가용 배지 용도로는 허용
  const rows = (await db.query(
    `SELECT items.id, items.name, items.total_qty, items.max_days, items.status,
            items.category_id, categories.name AS category_name,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos,
            (SELECT COUNT(*)::int FROM reservations r
             WHERE r.item_id = items.id
               AND r.status IN ('pending','approved','picked_up')
               AND CURRENT_DATE < r.end_date AND r.start_date <= CURRENT_DATE) AS active_now
     FROM items JOIN categories ON categories.id = items.category_id
     WHERE items.status <> 'retired'
       AND ($1 = 0 OR items.category_id = $1)
       AND ($2 = '' OR items.name ILIKE '%' || $2 || '%')
     ORDER BY items.id DESC`,
    [category, q],
  )) as ListItemRow[]

  const items = rows.map((r) => ({
    ...r,
    availability_badge:
      r.status === 'repair'
        ? 'repair'
        : r.active_now >= r.total_qty
          ? 'rented'
          : r.active_now > 0
            ? 'reserved'
            : 'available',
  }))
  return c.json({ items })
})

type DetailRow = {
  id: number
  name: string
  description: string | null
  status: 'active' | 'repair' | 'retired'
  total_qty: number
  max_days: number
  category_id: number
  category_name: string
  photos: { id: number; url: string }[]
}

// 상세 — 설명·수량·규칙 + 향후 90일 일별 점유 수 (§7.6, 회원 정보 제외)
itemsRoute.get('/:id', async (c) => {
  const db: Sql = getDb(c.env)
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)

  const itemRows = (await db.query(
    `SELECT items.id, items.name, items.description, items.status,
            items.total_qty, items.max_days, items.category_id, categories.name AS category_name,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos
     FROM items JOIN categories ON categories.id = items.category_id
     WHERE items.id = $1`,
    [id],
  )) as DetailRow[]
  if (itemRows.length === 0) return c.json({ error: 'not_found' }, 404)

  const availability = (await db.query(
    `SELECT d::date::text AS date, COUNT(r.id)::int AS reserved
     FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '89 days', '1 day') d
     LEFT JOIN reservations r
       ON r.item_id = $1
      AND r.status IN ('pending','approved','picked_up')
      AND r.start_date <= d::date AND r.end_date > d::date
     GROUP BY d ORDER BY d`,
    [id],
  )) as { date: string; reserved: number }[]

  return c.json({ item: itemRows[0], availability })
})
