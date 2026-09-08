import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb } from '../db'

// SPEC §7.4 — GET /api/categories (전체)
export const categoriesRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

categoriesRoute.get('/', async (c) => {
  const db = getDb(c.env)
  const categories = await db.query(
    'SELECT id, name, sort_order FROM categories ORDER BY sort_order, id',
  )
  return c.json({ categories })
})
