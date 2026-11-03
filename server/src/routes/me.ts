import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'
import { requireAuth } from '../middleware/auth'

// 프로필 입력(최초 1회) + 내 정보
export const meRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 이름·연락처 저장 — 승인 대기 상태에서도 호출 가능 (requireAuth)
meRoute.put('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^0-9-]/g, '').trim() : ''
  if (!name) return c.json({ error: 'name 필수' }, 400)
  if (!phone || phone.replace(/[^0-9]/g, '').length < 9)
    return c.json({ error: '휴대폰 번호를 정확히 입력하세요' }, 400)

  // 소속은 선택 입력. 키가 없으면 기존 값을 보존한다 — 구버전 클라이언트가
  // 이름·연락처만 보내도 소속이 조용히 지워지지 않게 한다.
  const affiliation = typeof body.affiliation === 'string'
    ? body.affiliation.trim().slice(0, 100) || null
    : null

  const db: Sql = getDb(c.env)
  if ('affiliation' in body) {
    await db.query('UPDATE members SET name = ?2, phone = ?3, affiliation = ?4 WHERE id = ?1', [
      user.id,
      name,
      phone,
      affiliation,
    ])
  } else {
    await db.query('UPDATE members SET name = ?2, phone = ?3 WHERE id = ?1', [user.id, name, phone])
  }
  return c.json({ ok: true })
})
