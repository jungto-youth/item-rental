import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'
import { requireAuth } from '../middleware/auth'

// 프로필 입력(최초 1회) + 내 정보
export const meRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 이름·연락처 저장 — 승인 대기 상태에서도 호출 가능 (requireAuth)
meRoute.put('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = await c.req.json<Record<string, unknown>>()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^0-9-]/g, '').trim() : ''
  if (!name) return c.json({ error: 'name 필수' }, 400)
  if (!phone || phone.replace(/[^0-9]/g, '').length < 9)
    return c.json({ error: '휴대폰 번호를 정확히 입력하세요' }, 400)

  const db: Sql = getDb(c.env)
  await db.query('UPDATE members SET name = $2, phone = $3 WHERE id = $1', [user.id, name, phone])
  return c.json({ ok: true })
})
