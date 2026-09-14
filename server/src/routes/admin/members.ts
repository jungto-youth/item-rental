import { Hono } from 'hono'
import type { Bindings, Role } from '../../types'
import { getDb, type Sql } from '../../db'
import { requireManager, requireAdmin } from '../../middleware/auth'

// SPEC §4.4 — 회원 관리
// 목록·승인/거절은 manager 이상, 역할 지정/해제는 admin(총관리자) 전용
export const adminMembersRoute = new Hono<{ Bindings: Bindings }>()

adminMembersRoute.use('*', requireManager)

// 회원 목록 — 승인 대기가 맨 위, 그 뒤 최근 가입순
adminMembersRoute.get('/', async (c) => {
  const db: Sql = getDb(c.env)
  const rows = await db.query(
    `SELECT id, email, name, phone, role, status, created_at
       FROM members
      ORDER BY (status = 'pending') DESC, created_at DESC`,
  )
  return c.json({ members: rows })
})

// 승인 — pending → approved
adminMembersRoute.post('/:id/approve', async (c) => {
  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE members SET status = 'approved' WHERE id = $1 AND status = 'pending' RETURNING id`,
    [c.req.param('id')],
  )) as { id: string }[]
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// 거절 — pending → inactive (이력 보존을 위해 삭제하지 않음, §4.1)
adminMembersRoute.post('/:id/reject', async (c) => {
  const db: Sql = getDb(c.env)
  const rows = (await db.query(
    `UPDATE members SET status = 'inactive' WHERE id = $1 AND status = 'pending' RETURNING id`,
    [c.req.param('id')],
  )) as { id: string }[]
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// 탈퇴(비활성화) — 관리자가 활성 회원을 비활성화한다. 약관이 회원에게 '탈퇴는 관리자에게 요청'이라
// 안내하는데 처리 수단이 없어 신설(§4.1, v3.1). 소프트 삭제 — 대여 이력 보존 위해 행 삭제 대신
// status = 'inactive'. 마지막 총관리자 보호는 역할 핸들러와 같은 기준.
adminMembersRoute.post('/:id/deactivate', async (c) => {
  const db: Sql = getDb(c.env)
  const id = c.req.param('id')
  const found = (await db.query('SELECT id, role FROM members WHERE id = $1', [id])) as {
    id: string
    role: string
  }[]
  if (found.length === 0) return c.json({ error: 'not_found' }, 404)
  if (found[0].role === 'admin') {
    const cnt = (await db.query(
      `SELECT COUNT(*)::int AS n FROM members WHERE role = 'admin' AND status = 'approved'`,
    )) as { n: number }[]
    if (cnt[0].n <= 1) return c.json({ error: 'last_admin' }, 409)
  }
  await db.query(`UPDATE members SET status = 'inactive' WHERE id = $1`, [id])
  return c.json({ ok: true })
})

// 역할 지정/해제 — 총관리자 전용 (v2.7)
adminMembersRoute.put('/:id/role', requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: Role }
  const role = body.role
  if (role !== 'user' && role !== 'manager' && role !== 'admin') {
    return c.json({ error: 'bad_role' }, 400)
  }
  const db: Sql = getDb(c.env)
  const id = c.req.param('id')
  const found = (await db.query('SELECT id, role, status FROM members WHERE id = $1', [id])) as {
    id: string
    role: Role
    status: string
  }[]
  if (found.length === 0) return c.json({ error: 'not_found' }, 404)
  const target = found[0]
  // 승인 대기/비활성 회원에게는 역할 부여 불가 — 승인 먼저
  if (role !== 'user' && target.status !== 'approved') {
    return c.json({ error: 'member_not_approved' }, 409)
  }
  // 마지막 총관리자 보호 — 해임하면 역할 관리가 불가능해짐 (본인 포함)
  if (target.role === 'admin' && role !== 'admin') {
    const cnt = (await db.query(`SELECT COUNT(*)::int AS n FROM members WHERE role = 'admin'`)) as {
      n: number
    }[]
    if (cnt[0].n <= 1) return c.json({ error: 'last_admin' }, 409)
  }
  await db.query('UPDATE members SET role = $1 WHERE id = $2', [role, id])
  return c.json({ ok: true })
})
