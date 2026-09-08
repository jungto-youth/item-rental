import { Hono } from 'hono'
import type { Bindings, Variables } from './types'
import { itemsRoute } from './routes/items'
import { categoriesRoute } from './routes/categories'
import { adminItemsRoute } from './routes/admin/items'
import { adminCategoriesRoute } from './routes/admin/categories'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// --- 헬스체크 ---
app.get('/api/health', (c) => c.json({ ok: true }))

// --- 세션 (SPEC §7.2) ---
// TODO(1주차): Auth.js(@auth/core) 연동 후 JWT 쿠키 검증으로 교체
app.get('/api/me', (c) => {
  const user = c.get('user') ?? null
  return c.json({ user })
})

// --- 사진 서빙 (R2) ---
// 키에 UUID가 포함되어 불변 → 1년 캐시. /api/*는 run_worker_first로 워커가 처리 (§7.5)
app.get('/api/photos/*', async (c) => {
  const key = c.req.path.slice('/api/photos/'.length)
  if (!key || key.includes('..')) return c.json({ error: 'bad_key' }, 400)
  const obj = await c.env.PHOTOS.get(key)
  if (!obj) return c.json({ error: 'not_found' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
})

// --- 도메인 라우트 ---
app.route('/api/items', itemsRoute)
app.route('/api/categories', categoriesRoute)
app.route('/api/admin/items', adminItemsRoute)
app.route('/api/admin/categories', adminCategoriesRoute)

// --- 에러 처리 ---
app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal' }, 500)
})

export default app
