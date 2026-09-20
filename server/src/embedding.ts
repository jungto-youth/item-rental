// 의미 검색용 임베딩 헬퍼 — Workers AI @cf/baai/bge-m3 (다국어, 1024차원)
// 생성은 물품 등록/수정 시 1회, 검색 시 쿼리 텍스트만 즉시 임베딩 (§4.2)
import type { Bindings } from './types'
import { getDb, type Sql } from './db'

const MODEL = '@cf/baai/bge-m3'

// 임베딩 입력 텍스트 — 이름·설명·태그 (0021부터 태그 포함 — 뿓뿓 분류 키워드 의미 검색)
export function itemEmbedText(name: string, description: string | null, tags = ''): string {
  return [name, description ?? '', tags].filter(Boolean).join(' | ')
}

// bge-m3로 임베딩 생성 → pgvector 문자열 '[0.1,0.2,...]' 반환
export async function embed(env: Bindings, text: string): Promise<string> {
  const res = (await env.AI.run(MODEL, { text: [text] })) as {
    data?: number[][]
    predictions?: number[][]
  }
  const vec = res.data?.[0] ?? res.predictions?.[0]
  if (!vec) throw new Error('임베딩 응답 형식 예상 외')
  return `[${vec.join(',')}]`
}

// 물품 1건 임베딩 갱신 — 태그명 조인 후 UPDATE. 실패해도 호출부를 죽이지 않음(키워드 검색은 계속 동작)
export async function embedItem(env: Bindings, db: Sql, itemId: number): Promise<void> {
  try {
    const rows = (await db.query(
      `SELECT i.name, i.description,
              (SELECT COALESCE(string_agg(c.name, ' ' ORDER BY c.name), '')
               FROM item_categories ic JOIN categories c ON c.id = ic.category_id
               WHERE ic.item_id = i.id) AS tags
       FROM items i WHERE i.id = $1`,
      [itemId],
    )) as { name: string; description: string | null; tags: string }[]
    if (rows.length === 0) return
    const text = itemEmbedText(rows[0].name, rows[0].description, rows[0].tags)
    const vec = await embed(env, text)
    await db.query('UPDATE items SET embedding = $1::vector WHERE id = $2', [vec, itemId])
  } catch (err) {
    console.error(`임베딩 생성 실패 (item ${itemId})`, err)
  }
}
