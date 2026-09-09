import { Hono } from 'hono'
import type { Bindings, Variables } from '../../types'
import { getDb, type Sql } from '../../db'
import { requireManager } from '../../middleware/auth'
import { embedItem } from '../../embedding'

// SPEC §7.4 — /api/admin/items (물품 CRUD + 사진 관리, admin 전용)
export const adminItemsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()
adminItemsRoute.use('*', requireManager)

const ITEM_STATUS = ['active', 'repair', 'retired'] as const
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_PHOTOS = 3 // §4.2 사진 최대 3장
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

type DbError = { code?: string }

// 목록 — 폐기 포함 전체 (관리자)
adminItemsRoute.get('/', async (c) => {
  const db: Sql = getDb(c.env)
  const items = await db.query(
    `SELECT items.*,
            (SELECT COUNT(*)::int FROM item_photos p WHERE p.item_id = items.id) AS photo_count,
            (SELECT COUNT(*)::int FROM reservations r WHERE r.item_id = items.id) AS reservation_count
     FROM items
     ORDER BY items.id DESC`,
  )
  return c.json({ items })
})

// 등록 — 카테고리는 없음 (v2.5): 탐색은 키워드+의미 검색으로 대체
adminItemsRoute.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name 필수' }, 400)
  const total_qty = Number(body.total_qty ?? 1)
  const max_days = Number(body.max_days ?? 7)
  const status = ITEM_STATUS.includes(body.status as never) ? (body.status as string) : 'active'
  if (!Number.isInteger(total_qty) || total_qty < 1) return c.json({ error: 'total_qty는 1 이상' }, 400)
  if (!Number.isInteger(max_days) || max_days < 1 || max_days > 365)
    return c.json({ error: 'max_days는 1~365' }, 400)

  const db: Sql = getDb(c.env)
  const [row] = (await db.query(
    `INSERT INTO items (name, description, status, total_qty, max_days)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, body.description ?? null, status, total_qty, max_days],
  )) as { id: number }[]
  // 등록 즉시 의미 검색용 임베딩 생성 (실패해도 등록은 성공 — 키워드 검색은 계속 동작)
  await embedItem(c.env, db, row.id)
  return c.json({ id: row.id }, 201)
})

// 수정 — 전달된 필드만 갱신
adminItemsRoute.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>()
  const fields: Record<string, unknown> = {}
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'name 빈 값 불가' }, 400)
    fields.name = name
  }
  if ('description' in body) fields.description = body.description ?? null
  if ('total_qty' in body) {
    const total_qty = Number(body.total_qty)
    if (!Number.isInteger(total_qty) || total_qty < 1) return c.json({ error: 'total_qty는 1 이상' }, 400)
    fields.total_qty = total_qty
  }
  if ('max_days' in body) {
    const max_days = Number(body.max_days)
    if (!Number.isInteger(max_days) || max_days < 1 || max_days > 365)
      return c.json({ error: 'max_days는 1~365' }, 400)
    fields.max_days = max_days
  }
  if ('status' in body) {
    if (!ITEM_STATUS.includes(body.status as never)) return c.json({ error: 'status 오류' }, 400)
    fields.status = body.status
  }
  if (Object.keys(fields).length === 0) return c.json({ error: '변경할 필드 없음' }, 400)

  const keys = Object.keys(fields)
  const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const db: Sql = getDb(c.env)
  const rows = (await db.query(`UPDATE items SET ${setSql} WHERE id = $1 RETURNING id`, [
    id,
    ...keys.map((k) => fields[k]),
  ])) as { id: number }[]
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  // 이름·설명이 바뀌면 임베딩도 갱신 (무조건 재생성 — 소규모라 비용 무시)
  await embedItem(c.env, db, id)
  return c.json({ ok: true })
})

// 삭제 — 대여 이력이 있으면 거부 (폐기 상태로 전환 권장)
adminItemsRoute.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db: Sql = getDb(c.env)
  const [cnt] = (await db.query('SELECT COUNT(*)::int AS n FROM reservations WHERE item_id = $1', [
    id,
  ])) as { n: number }[]
  if (cnt.n > 0) return c.json({ error: '대여 이력이 있어 삭제 불가 — 상태를 폐기로 변경하세요' }, 409)
  const rows = (await db.query('DELETE FROM items WHERE id = $1 RETURNING id', [id])) as { id: number }[]
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  // 사진 파일은 R2에 잔존 가능(키 유실 방지 위해 행은 CASCADE로 함께 삭제됨) — 잔존 오브젝트 정리는 운영에서 주기 처리
  return c.json({ ok: true })
})

// 사진 업로드 — multipart/form-data "file" 필드 → R2 직접 저장 (§4.2)
adminItemsRoute.post('/:id/photos', async (c) => {
  const itemId = Number(c.req.param('id'))
  const form = await c.req.formData()
  const file = form.get('file') as unknown
  if (!(file instanceof File)) return c.json({ error: 'file 필드 필요' }, 400)
  const ext = PHOTO_TYPES[file.type]
  if (!ext) return c.json({ error: '지원 형식: JPEG/PNG/WebP' }, 400)
  if (file.size > MAX_PHOTO_BYTES) return c.json({ error: '사진은 최대 5MB' }, 400)

  const db: Sql = getDb(c.env)
  const exists = (await db.query('SELECT id FROM items WHERE id = $1', [
    itemId,
  ])) as { id: number }[]
  if (exists.length === 0) return c.json({ error: 'not_found' }, 404)
  const [cnt] = (await db.query('SELECT COUNT(*)::int AS n FROM item_photos WHERE item_id = $1', [
    itemId,
  ])) as { n: number }[]
  if (cnt.n >= MAX_PHOTOS) return c.json({ error: `사진은 최대 ${MAX_PHOTOS}장` }, 409)

  const key = `items/${itemId}/${crypto.randomUUID()}.${ext}`
  await c.env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } })
  const [row] = (await db.query(
    'INSERT INTO item_photos (item_id, r2_key) VALUES ($1, $2) RETURNING id',
    [itemId, key],
  )) as { id: number }[]
  return c.json({ id: row.id, url: `/api/photos/${key}` }, 201)
})

// 사진 삭제 — R2 오브젝트 + 행 함께 제거
adminItemsRoute.delete('/:id/photos/:photoId', async (c) => {
  const itemId = Number(c.req.param('id'))
  const photoId = Number(c.req.param('photoId'))
  const db: Sql = getDb(c.env)
  const rows = (await db.query('SELECT id, r2_key FROM item_photos WHERE id = $1 AND item_id = $2', [
    photoId,
    itemId,
  ])) as { id: number; r2_key: string }[]
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  await c.env.PHOTOS.delete(rows[0].r2_key)
  await db.query('DELETE FROM item_photos WHERE id = $1', [photoId])
  return c.json({ ok: true })
})
