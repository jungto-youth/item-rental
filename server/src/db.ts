import { neon } from '@neondatabase/serverless'
import type { Bindings } from './types'

// Neon HTTP 드라이버 (fetch 기반, Workers 친화)
// HTTP 모드는 무상태라 요청마다 생성해도 커넥션 풀이 필요 없다.
export type Sql = ReturnType<typeof neon>

export function getDb(env: Bindings): Sql {
  return neon(env.DATABASE_URL)
}
