// 의미 검색용 임베딩 헬퍼 — Workers AI @cf/baai/bge-m3 (다국어, 1024차원)
// 생성은 물품 등록/수정 시 1회, 검색 시 쿼리 텍스트만 즉시 임베딩 ()
// D1엔 pgvector가 없다 — 벡터는 BLOB(1024×f32 little-endian)로 저장하고 코사인은 JS로 계산한다 (PLAN §7.1)
import type { Bindings } from './types'
import { getDb, type Sql } from './db'

const MODEL = '@cf/baai/bge-m3'

// 임베딩 입력 텍스트 — 이름·설명·태그 (0021부터 태그 포함 — 뿓뿓 분류 키워드 의미 검색)
export function itemEmbedText(name: string, description: string | null, tags = ''): string {
  return [name, description ?? '', tags].filter(Boolean).join(' | ')
}

// bge-m3로 임베딩 생성 → Float32Array 반환 (BLOB 직렬화는 vecToBlob, 캐시는 이 타입 그대로)
export async function embed(env: Bindings, text: string): Promise<Float32Array> {
  const res = (await env.AI.run(MODEL, { text: [text] })) as {
    data?: number[][]
    predictions?: number[][]
  }
  const vec = res.data?.[0] ?? res.predictions?.[0]
  if (!vec) throw new Error('임베딩 응답 형식 예상 외')
  return Float32Array.from(vec)
}

// Float32Array → little-endian f32 BLOB 파라미터. DataView로 명시 LE — 플랫폼 엔디안 가정 제거
export function vecToBlob(v: Float32Array): Uint8Array {
  const out = new Uint8Array(v.length * 4)
  const dv = new DataView(out.buffer)
  for (let i = 0; i < v.length; i++) dv.setFloat32(i * 4, v[i], true)
  return out
}

// 벡터 + 미리 계산한 노름 — 코사인 분모를 매번 다시 계산하지 않는다
export type Vec = { v: Float32Array; norm: number };

// D1 BLOB(ArrayBuffer) → 벡터 + 노름. 수천 건 전수 계산이라 노름을 저장해 둔다
export function blobToVec(b: ArrayBuffer | Uint8Array): Vec {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = Math.floor(bytes.byteLength / 4)
  const v = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    v[i] = dv.getFloat32(i * 4, true)
    sum += v[i] * v[i]
  }
  return { v, norm: Math.sqrt(sum) }
}

// ===== isolate 벡터 캐시 (PLAN §7.2) =====
// 최초 의미검색 때 전 물품 벡터를 한 번에 올린다(수백 개 ≈ 수백 KB). 이후 의미검색은 D1 왕복 0.
// 이 isolate 안의 임베딩 생성/삭제가 캐시를 갱신한다 — 타 isolate의 변경은 isolate 수명(수 분) 안에 반영된다.
const VEC_CACHE = new Map<number, Vec>()
let vecCacheLoaded = false

export async function getVectorCache(db: Sql): Promise<Map<number, Vec>> {
  if (vecCacheLoaded) return VEC_CACHE
  const rows = (await db.query(
    `SELECT id, embedding FROM items WHERE embedding IS NOT NULL`,
  )) as { id: number; embedding: ArrayBuffer | Uint8Array }[]
  for (const r of rows) VEC_CACHE.set(r.id, blobToVec(r.embedding))
  vecCacheLoaded = true
  return VEC_CACHE
}

export function cacheVec(itemId: number, vec: Float32Array): void {
  let sum = 0
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i]
  VEC_CACHE.set(itemId, { v: vec, norm: Math.sqrt(sum) })
}

export function uncacheVec(itemId: number): void {
  VEC_CACHE.delete(itemId)
}

// 물품 1건 임베딩 갱신 — 태그명 조인 후 UPDATE. 실패해도 호출부를 죽이지 않음(키워드 검색은 계속 동작)
export async function embedItem(env: Bindings, db: Sql, itemId: number): Promise<void> {
  try {
    const rows = (await db.query(
      `SELECT i.name, i.description,
              (SELECT group_concat(c.name, ' ')
                 FROM (SELECT c.name FROM item_categories ic
                        JOIN categories c ON c.id = ic.category_id
                        WHERE ic.item_id = i.id ORDER BY c.name) c) AS tags
       FROM items i WHERE i.id = ?1`,
      [itemId],
    )) as { name: string; description: string | null; tags: string | null }[]
    if (rows.length === 0) return
    const text = itemEmbedText(rows[0].name, rows[0].description, rows[0].tags ?? '')
    const vec = await embed(env, text)
    await db.query('UPDATE items SET embedding = ?1 WHERE id = ?2', [vecToBlob(vec), itemId])
    cacheVec(itemId, vec)
  } catch (err) {
    console.error(`임베딩 생성 실패 (item ${itemId})`, err)
  }
}
