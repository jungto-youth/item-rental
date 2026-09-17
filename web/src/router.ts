import { Router, type Route } from "@vaadin/router";
import { session } from "./context/session";
import "./pages/home";
import "./pages/item-detail";
import "./pages/login";
import "./pages/mypage";
import "./pages/signup-profile";
import "./pages/not-found";
import "./pages/admin/members";
import "./pages/admin/reservations";
import "./pages/admin/dashboard";
import "./pages/admin/history";
import "./pages/policy";
import { setUnauthorizedHandler } from "./api/client";

// vaadin의 action 시그니처 — Route 타입에서 추출해 가드에 재사용
type RouteAction = NonNullable<Route["action"]>;

// SPEC §7.3 — 라우트 가드 (실제 권한은 서버 미들웨어가 이중 강제 — §8)
const requireSession: RouteAction = async (_context, commands) => {
  const user = await session.ensure();
  if (!user) return commands.redirect("/login");
  return undefined;
};

// admin 전용 — /admin/* 진입 가드 (실제 권한은 서버가 이중 강제)
const requireAdmin: RouteAction = async (_context, commands) => {
  const user = await session.ensure();
  if (!user) return commands.redirect("/login");
  if (user.role !== "admin") return commands.redirect("/?role=denied"); // 안내는 home(denied 배너)이 표시 — 냉무 리다이렉트 회피(§6)
  return undefined;
};

let routerInstance: Router | null = null;

// 컴포넌트에서 SPA 내 이동할 때 사용
// 쿼리스트링이 있으면 분리해서 전달 — render(문자열)은 '?…'까지 경로로 매칭해 not-found가 됨
export function navigate(path: string) {
  if (routerInstance) {
    const u = new URL(path, location.origin);
    routerInstance.render(
      { pathname: u.pathname, search: u.search, hash: u.hash },
      true,
    );
  } else {
    window.location.assign(path);
  }
}

// 내부 링크 클릭을 SPA 이동으로 — 헤더·본문의 <a href="/…">가 클릭마다 문서를 새로 로드해
// 앱이 재부팅되고(모듈 재파싱 + session 초기화 → /api/me 재요청) 헤더 계정 칩이
// "로그인" 버튼으로 깜빡이던 문제를 한 곳에서 없앤다.
//
// click은 composed: true라 shadow 경계를 넘어 document까지 오지만, 경계를 넘는 순간
// event.target이 호스트 엘리먼트(<app-shell>)로 리타게팅된다. 그래서 document에서
// e.target.closest('a')는 항상 null — 실제 앵커는 composedPath()로만 찾을 수 있다.
let linkListenerInstalled = false;

function installLinkListener() {
  if (linkListenerInstalled) return;
  linkListenerInstalled = true;

  document.addEventListener("click", (e: MouseEvent) => {
    // 라우터 자체가 클릭을 가로채는 버전이면 그쪽이 먼저 preventDefault 한다 — 이중 이동 방지
    if (e.defaultPrevented || e.button !== 0) return;
    // ⌘·Ctrl(새 탭), Shift(새 창) 클릭은 브라우저에 맡긴다 — 뺏으면 흔한 회귀가 된다
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e
      .composedPath()
      .find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    if (
      !a ||
      a.target ||
      a.hasAttribute("download") ||
      a.getAttribute("rel") === "external"
    ) {
      return;
    }

    const href = a.getAttribute("href");
    // mailto:·tel:·#fragment·상대경로는 브라우저 기본 동작에 맡긴다
    if (!href || !href.startsWith("/")) return;

    const url = new URL(a.href, location.origin);
    // '//host/path' 프로토콜 상대 URL은 startsWith('/')를 통과한다 — origin 비교가 따로 필요
    if (url.origin !== location.origin) return;

    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
}

export function initRouter(outlet: HTMLElement): Router {
  const router = new Router(outlet);
  router.setRoutes([
    { path: "/", component: "page-home" },
    { path: "/items/:id", component: "page-item-detail" },
    { path: "/login", component: "page-login" },
    { path: "/mypage", component: "page-mypage", action: requireSession },
    {
      path: "/signup/profile",
      component: "page-signup-profile",
      action: requireSession,
    },
    {
      path: "/admin",
      component: "page-admin-dashboard",
      action: requireAdmin,
    },
    {
      path: "/admin/reservations",
      component: "page-admin-reservations",
      action: requireAdmin,
    },
    {
      path: "/admin/members",
      component: "page-admin-members",
      action: requireAdmin,
    },
    {
      path: "/admin/history",
      component: "page-admin-history",
      action: requireAdmin,
    },
    { path: "/policy/:kind", component: "page-policy" },
    { path: "(.*)", component: "page-not-found" },
  ]);
  routerInstance = router;
  installLinkListener(); // routerInstance 확정 후 — 리스너가 navigate()를 쓰기 때문

  // 풀 리로드가 사라져 브라우저의 스크롤 리셋도 사라졌다
  window.addEventListener("vaadin-router-location-changed", () => {
    window.scrollTo(0, 0);
  });

  return router;
}

// 401(쿠키 만료) → 세션을 비우고 로그인으로.
// - 이미 로그인된 세션(캐시된 user)이 있을 때만 반응한다. 익명 방문자의 /api/me 401에
//   반응하면 공개 페이지(/)에서 /login으로 밀려난다 — 보호 라우트는 가드가 알아서 보낸다.
// - /api/me 자체가 401이면 refresh가 다시 401을 받아 재진입하므로 플래그로 1회 제한.
let handlingUnauthorized = false;
setUnauthorizedHandler(() => {
  // 익명 방문자의 /api/me 401에 반응하면 공개 페이지(/)에서 /login으로 밀려난다
  if (handlingUnauthorized || !session.user) return;
  handlingUnauthorized = true;
  void session.refresh().finally(() => {
    handlingUnauthorized = false;
    if (!session.user && location.pathname !== "/login") navigate("/login");
  });
});
