import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'

// SPEC §7.4 — GET /api/items, /api/items/:id (전체 열람 가능)
// TODO(2주차): Postgres 실쿼리로 교체 (getDb — server/src/db.ts) — 카테고리 필터 + 이름 검색 + 가용 배지
export const itemsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

itemsRoute.get('/', async (c) => {
  const q = c.req.query('q') ?? ''
  const category = c.req.query('category')
  return c.json({ items: [], q, category })
})

itemsRoute.get('/:id', async (c) => {
  const id = c.req.param('id')
  // TODO(2주차): 상세 + 사진 + 점유 기간 목록(향후 90일, 회원 정보 제외 — SPEC §7.6)
  return c.json({ item: null, id })
})
