// 공유 타입 — Hono 앱 전역 바인딩/변수
export type Bindings = {
  // Neon 연결 문자열 — 배포: `wrangler secret put DATABASE_URL` / 로컬: .dev.vars
  DATABASE_URL: string
  // Auth.js — 배포: `wrangler secret put` / 로컬: .dev.vars
  AUTH_SECRET: string
  AUTH_GOOGLE_ID: string
  AUTH_GOOGLE_SECRET: string
  PHOTOS: R2Bucket
  ASSETS: Fetcher
}

// 미들웨어가 세팅하는 세션 사용자 (SPEC §8 권한 처리)
export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'member' | 'admin'
  status: 'pending' | 'approved' | 'inactive'
}

export type Variables = {
  user: SessionUser | null
}
