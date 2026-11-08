import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'
import { requireAuth } from '../middleware/auth'
import { formatAffiliation, isValidAffiliation } from '../../../shared/affiliation'

// 프로필 입력(최초 1회) + 내 정보
export const meRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 이름·연락처·지부·지회·모둠 저장 — 승인 대기 상태에서도 호출 가능 (requireAuth)
// affiliation 은 지부·지회·모둠에서 서버가 조합해 만든다. 클라이언트가 보낸 임의 문자열을
// 그대로 저장하지 않는다 — 대여 스냅샷·관리자 화면이 이 값을 신뢰하기 때문.
meRoute.put('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^0-9-]/g, '').trim() : ''
  // 지부가 없던 시절의 클라이언트는 청년지부로 취급한다.
  const division = typeof body.division === 'string' && body.division.trim()
    ? body.division.trim()
    : '청년지부'
  const branch = typeof body.branch === 'string' ? body.branch.trim() : ''
  const group = typeof body.group === 'string' ? body.group.trim() : ''
  if (!name) return c.json({ error: 'name 필수' }, 400)
  if (!phone || phone.replace(/[^0-9]/g, '').length < 9)
    return c.json({ error: '휴대폰 번호를 정확히 입력해 주세요' }, 400)
  if (!isValidAffiliation(division, branch, group))
    return c.json({ error: '지부·지회·모둠을 정확히 입력해 주세요' }, 400)

  const db: Sql = getDb(c.env)
  await db.query('UPDATE members SET name = ?2, phone = ?3, affiliation = ?4 WHERE id = ?1', [
    user.id,
    name,
    phone,
    formatAffiliation(division, branch, group),
  ])
  return c.json({ ok: true })
})
