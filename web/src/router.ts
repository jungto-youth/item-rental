import { Router, type Route } from '@vaadin/router'
import { session } from './context/session'
import './pages/home'
import './pages/item-detail'
import './pages/login'
import './pages/mypage'
import './pages/signup-profile'
import './pages/not-found'
import './pages/admin/items'
import './pages/admin/members'

// vaadin의 action 시그니처 — Route 타입에서 추출해 가드에 재사용
type RouteAction = NonNullable<Route['action']>

// SPEC §7.3 — 라우트 가드 (실제 권한은 서버 미들웨어가 이중 강제 — §8)
const requireSession: RouteAction = async (_context, commands) => {
  const user = await session.ensure()
  if (!user) return commands.redirect('/login')
  return undefined
}

// manager 이상 (관리자·총관리자) — /admin/* 진입 가드 (실제 권한은 서버가 이중 강제)
const requireManager: RouteAction = async (_context, commands) => {
  const user = await session.ensure()
  if (!user) return commands.redirect('/login')
  if (user.role !== 'manager' && user.role !== 'admin') return commands.redirect('/')
  return undefined
}

let routerInstance: Router | null = null

// 컴포넌트에서 SPA 내 이동할 때 사용
export function navigate(path: string) {
  if (routerInstance) routerInstance.render(path, true)
  else window.location.assign(path)
}

export function initRouter(outlet: HTMLElement): Router {
  const router = new Router(outlet)
  router.setRoutes([
    { path: '/', component: 'page-home' },
    { path: '/items/:id', component: 'page-item-detail' },
    { path: '/login', component: 'page-login' },
    { path: '/mypage', component: 'page-mypage', action: requireSession },
    { path: '/signup/profile', component: 'page-signup-profile', action: requireSession },
    { path: '/admin/items', component: 'page-admin-items', action: requireManager },
    { path: '/admin/members', component: 'page-admin-members', action: requireManager },
    { path: '(.*)', component: 'page-not-found' },
  ])
  routerInstance = router
  return router
}
