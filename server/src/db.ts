// D1 어댑터 — 기존 neon Sql 의 query() 시그니처를 그대로 흉내낸다 (PLAN_D1_이관.md §5.1).
// 호출부는 SQL 문자열만 고치고($N → ?N), 데이터 접근 코드는 유지한다.
// D1 PreparedStatement 는 하나의 요청 안에서 재사용할 수 있고 Workers 는 무상태라
// 요청마다 어댑터 객체를 만들어도 커넥션 풀 같은 자원이 생기지 않는다.
import type { Bindings } from './types'

export type Sql = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  // D1 batch 는 하나의 트랜잭션으로 원자 실행 — 도중 실패 시 전부 롤백된다.
  batch<T = Record<string, unknown>>(stmts: { sql: string; params?: unknown[] }[]): Promise<T[][]>
}

// now() 대체 — ISO 8601(ms, Z) 문자열. Postgres timestamptz 의 JSON 직렬화 형태와
// 동일하게 유지해 프론트엔드 응답을 바꾸지 않는다 (PLAN §6 규칙표).
export const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function getDb(env: Bindings): Sql {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const { results } = await env.DB.prepare(sql).bind(...params).all<T>()
      return results
    },
    async batch<T = Record<string, unknown>>(
      stmts: { sql: string; params?: unknown[] }[],
    ): Promise<T[][]> {
      const results = await env.DB.batch<T>(
        stmts.map((s) => env.DB.prepare(s.sql).bind(...(s.params ?? []))),
      )
      return results.map((r) => r.results)
    },
  }
}
