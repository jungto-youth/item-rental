import { Router } from '@vaadin/router'
import './pages/home'
import './pages/login'
import './pages/mypage'
import './pages/not-found'

// SPEC §7.3 — 라우트 가드
// TODO(1주차): /api/me 결과로 session 검사 → 미로그인 시 /login 리다이렉트
const requireSession = () => undefined

export function initRouter(outlet: HTMLElement): Router {
  const router = new Router(outlet)
  router.setRoutes([
    { path: '/', component: 'page-home' },
    { path: '/login', component: 'page-login' },
    { path: '/mypage', component: 'page-mypage', action: requireSession },
    { path: '(.*)', component: 'page-not-found' },
  ])
  return router
}
