import Google from '@auth/core/providers/google'
import type { AuthConfig } from '@auth/core'
import type { Bindings } from './types'
import { getDb, type Sql } from './db'

// SPEC §7.2 — Auth.js (@auth/core) 구글 OAuth + JWT 세션
// Workers에서 process.env가 없으므로 바인딩 값을 직접 주입한다.
export function authConfig(env: Bindings): AuthConfig {
  const db = () => getDb(env)

  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    basePath: '/api/auth',
    session: { strategy: 'jwt' },
    providers: [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })],
    callbacks: {
      // 최초 로그인 시 members 생성 (§4.1 — 승인 대기 상태로 시작)
      async signIn({ user }) {
        if (!user.email) return false
        const sql: Sql = db()
        await sql.query(
          `INSERT INTO members (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
          [user.email, user.name ?? ''],
        )
        return true
      },
      // JWT sub를 members.id로 교체 — 이후 모든 쿼리가 이 값으로 권한 판단 (§8)
      async jwt({ token, user }) {
        if (user?.email) {
          const rows = (await db().query('SELECT id FROM members WHERE email = $1', [
            user.email,
          ])) as { id: string }[]
          if (rows[0]) token.sub = rows[0].id
        }
        return token
      },
    },
  }
}
