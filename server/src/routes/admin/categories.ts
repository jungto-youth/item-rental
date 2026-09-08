import { Hono } from 'hono'
import type { Bindings, Variables } from '../../types'
import { getDb, type Sql } from '../../db'
import { requireAdmin } from '../../middleware/auth'

// 카테고리 추가 (관리자) — 목록 조회는 공개 routes/categories.ts
export const adminCategoriesRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()
adminCategoriesRoute.use('*', requireAdmin)

adminCategoriesRoute.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sort_order = Number(body.sort_order ?? 0)
  if (!name) return c.json({ error: 'name 필수' }, 400)

  const db: Sql = getDb(c.env)
  try {
    const [row] = (await db.query(
      'INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING id',
      [name, sort_order],
    )) as { id: number }[]
    return c.json({ id: row.id }, 201)
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return c.json({ error: '이미 존재하는 카테고리' }, 409)
    throw err
  }
})
