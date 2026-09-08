import { Hono } from 'hono'
import type { Bindings, Variables } from './types'
import { itemsRoute } from './routes/items'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// --- 헬스체크 ---
app.get('/api/health', (c) => c.json({ ok: true }))

// --- 세션 (SPEC §7.2) ---
// TODO(1주차): Auth.js(@auth/core) 연동 후 JWT 쿠키 검증으로 교체
app.get('/api/me', (c) => {
  const user = c.get('user') ?? null
  return c.json({ user })
})

// --- 도메인 라우트 ---
app.route('/api/items', itemsRoute)

// --- 에러 처리 ---
app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal' }, 500)
})

export default app
