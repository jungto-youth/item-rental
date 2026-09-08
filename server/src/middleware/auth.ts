import type { Context, Next } from 'hono'

// SPEC §8 — requireAuth / requireApproved / requireAdmin
// TODO(1주차): Auth.js JWT 쿠키 검증 구현 전까지는 통과 스텁.
//  - requireAuth: HttpOnly 쿠키의 JWT 검증 → c.set('user', ...)
//  - requireApproved: status === 'approved' 만 통과, 아니면 403
//  - requireAdmin: role === 'admin' 만 통과, 아니면 403
export async function requireAuth(_c: Context, next: Next) {
  await next()
}

export const requireApproved = requireAuth
export const requireAdmin = requireAuth
