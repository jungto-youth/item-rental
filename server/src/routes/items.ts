import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'
import { getDb, type Sql } from '../db'
import { embed } from '../embedding'

// SPEC §7.4 — GET /api/items, /api/items/:id (전체 열람 가능)
export const itemsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

type ListItemRow = {
  id: number
  name: string
  total_qty: number
  max_days: number
  status: 'active' | 'repair' | 'retired'
  photos: { id: number; url: string }[]
  active_now: number
}

// 목록 SELECT 공용 — 키워드/의미 두 단계가 where 절만 다르게 재사용
function listSql(where: string): string {
  // CURRENT_DATE는 UTC 기준 — KST 0~9시 사이 하루 차이 가능하지만 가용 배지 용도로는 허용
  return `SELECT items.id, items.name, items.total_qty, items.max_days, items.status,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos,
            (SELECT COUNT(*)::int FROM reservations r
             WHERE r.item_id = items.id
               AND r.status IN ('pending','approved','picked_up')
               AND CURRENT_DATE < r.end_date AND r.start_date <= CURRENT_DATE) AS active_now
     FROM items
     WHERE items.status <> 'retired' ${where}
     ORDER BY items.id DESC`
}

// 의미 후보 — 쿼리 임베딩과 거리 상위 8개 (§4.2)
// bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계로 관련/무관 구분이 안 됨 → 상대 랭킹으로만 사용
// 실패해도 키워드 검색은 계속 동작해야 하므로 빈 배열로 흡수
async function semanticItemIds(env: Bindings, db: Sql, q: string): Promise<number[]> {
  try {
    const vec = await embed(env, q)
    const rows = (await db.query(
      `SELECT id FROM items
       WHERE status <> 'retired' AND embedding IS NOT NULL
         AND embedding <=> $1::vector < 0.75
       ORDER BY embedding <=> $1::vector
       LIMIT 8`,
      [vec],
    )) as { id: number }[]
    return rows.map((r) => r.id)
  } catch (err) {
    console.error('의미 검색 실패 — 키워드 검색으로 폴백', err)
    return []
  }
}

// 목록 — 검색(키워드 → 의미 순) + 가용 배지 (§4.2)
itemsRoute.get('/', async (c) => {
  const db: Sql = getDb(c.env)
  // 단어 단위 AND 검색 — 각 단어가 이름·설명 중 하나라도 매치되면 통과
  const tokens = (c.req.query('q') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)
  const searchConds = tokens
    .map(
      (_, i) =>
        `(items.name ILIKE '%' || $${i + 1} || '%'
        OR items.description ILIKE '%' || $${i + 1} || '%')`,
    )
    .join(' AND ')

  // 1단계 — 키워드 매치 (정확 검색이 항상 앞에 옴)
  let kwWhere = ''
  if (searchConds) kwWhere += ` AND ${searchConds}`
  const kwRows = (await db.query(listSql(kwWhere), tokens)) as ListItemRow[]

  // 2단계 — 의미 매치 (키워드에 이미 나온 물품 제외, 거리순)
  let semRows: ListItemRow[] = []
  if (tokens.length) {
    const kwIds = new Set(kwRows.map((r) => r.id))
    // 키워드 매치 id는 이미 JS에서 제외 (SQL NOT 절 대신 — 파라미터 인덱스 꼬임 방지)
    const extra = (await semanticItemIds(c.env, db, tokens.join(' '))).filter((id) => !kwIds.has(id))
    if (extra.length) {
      semRows = (await db.query(
        listSql(` AND items.id = ANY(string_to_array($1, ',')::int[])`),
        [extra.join(',')],
      )) as ListItemRow[]
      // listSql이 id DESC로 정렬하므로 거리 순위를 JS에서 복원
      const rank = new Map(extra.map((id, i) => [id, i]))
      semRows.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
    }
  }

  const items = [...kwRows, ...semRows].map((r) => ({
    ...r,
    availability_badge:
      r.status === 'repair'
        ? 'repair'
        : r.active_now >= r.total_qty
          ? 'rented'
          : r.active_now > 0
            ? 'reserved'
            : 'available',
  }))
  return c.json({ items })
})

type DetailRow = {
  id: number
  name: string
  description: string | null
  status: 'active' | 'repair' | 'retired'
  total_qty: number
  max_days: number
  photos: { id: number; url: string }[]
}

// 상세 — 설명·수량·규칙 + 향후 90일 일별 점유 수 (§7.6, 회원 정보 제외)
itemsRoute.get('/:id', async (c) => {
  const db: Sql = getDb(c.env)
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'bad_id' }, 400)

  const itemRows = (await db.query(
    `SELECT items.id, items.name, items.description, items.status,
            items.total_qty, items.max_days,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos
     FROM items
     WHERE items.id = $1`,
    [id],
  )) as DetailRow[]
  if (itemRows.length === 0) return c.json({ error: 'not_found' }, 404)

  const availability = (await db.query(
    `SELECT d::date::text AS date, COUNT(r.id)::int AS reserved
     FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '89 days', '1 day') d
     LEFT JOIN reservations r
       ON r.item_id = $1
      AND r.status IN ('pending','approved','picked_up')
      AND r.start_date <= d::date AND r.end_date > d::date
     GROUP BY d ORDER BY d`,
    [id],
  )) as { date: string; reserved: number }[]

  return c.json({ item: itemRows[0], availability })
})
