import Google from '@auth/core/providers/google'
import type { AuthConfig } from '@auth/core'
import type { Bindings } from './types'
import { getDb, type Sql } from './db'

// Auth.js (@auth/core) 구글 OAuth + JWT 세션
// Workers에서 process.env가 없으므로 바인딩 값을 직접 주입한다.
export function authConfig(env: Bindings, req?: Request): AuthConfig {
  const db = () => getDb(env)

  // 127.0.0.1 → localhost 정규화 — Google OAuth redirect_uri 등록 문제.
  // Auth.js는 trustHost:true 일 때 Host 헤더를 그대로 redirect_uri로 쓰는데,
  // Google Cloud Console에는 http://localhost:8787/... 만 등록되어 있고
  // http://127.0.0.1:8787/... 은 등록되어 있지 않아 redirect_uri_mismatch 가 난다.
  // (localhost 와 127.0.0.1 은 다른 origin) — redirectProxyUrl 로 Google에 보낼
  // redirect_uri 를 강제한다. 로컬 개발에서만 치환되고 운영은 영향 없음.
  let redirectProxyUrl: string | undefined
  if (req) {
    const url = new URL(req.url)
    if (url.hostname === '127.0.0.1') {
      redirectProxyUrl = `http://localhost:${url.port || '80'}/api/auth`
    }
  }

  // 로그인 허용 범위 — 정토회 계정(@jungto.org) + 예외 이메일(AUTH_ALLOWED_EMAILS, 콤마 구분).
  // 예외는 운영진이 개인 계정으로 접속할 때 쓴다 (wrangler secret / .dev.vars로 관리).
  const allowedEmails = (env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const isAllowed = (email: string) =>
    email.toLowerCase().endsWith('@jungto.org') || allowedEmails.includes(email.toLowerCase())

  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    basePath: '/api/auth',
    ...(redirectProxyUrl ? { redirectProxyUrl } : {}), // 127.0.0.1 → localhost 정규화 (로컬 개발 전용)
    session: { strategy: 'jwt' },
    pages: { error: '/login' }, // 로그인 거부 시 SPA 로그인 화면으로 ?error=와 함께 복귀
    providers: [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // 브라우저에 로그인된 개인 계정이 자동 선택되는 것을 막음 — 항상 계정 선택부터
        authorization: { params: { prompt: 'select_account' } },
      }),
    ],
    callbacks: {
      // 최초 로그인 시 members 자동 가입 (로그인이 곧 가입, 대기/승인 단계 없음)
      // 정토회 계정이 아니면 여기서 차단 — members 생성 자체를 하지 않음
      async signIn({ user }) {
        if (!user.email || !isAllowed(user.email)) {
          // 진단용 — 실제 OAuth로 들어온 이메일 확인 (wrangler tail에서 확인 후 제거 예정)
          console.log('로그인 거부 — 허용되지 않는 계정:', user.email ?? '(이메일 없음)')
          return false
        }
        try {
          const sql: Sql = db()
          await sql.query(
            `INSERT INTO members (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
            [user.email, user.name ?? ''],
          )
        } catch (err) {
          // DB 실패도 AccessDenied로 포장되어 같은 화면이 뜨므로 로그로 반드시 구분
          console.error('members 생성 실패 (DB 오류 — 허용 계정이 맞음):', err)
          throw err
        }
        return true
      },
      // JWT sub를 members.id로 교체 — 이후 모든 쿼리가 이 값으로 권한 판단 ()
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
