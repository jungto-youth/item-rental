import { html, type ReactiveControllerHost } from "lit";
import { Router, type RouteConfig } from "@lit-labs/router";
import { session } from "./context/session";
import "./pages/home";
import { setUnauthorizedHandler } from "./api/client";

// 라우트별 코드 스플릿 — 각 화면을 동적 import(literal 경로, Vite 청크 분할)로 받아
// 홈 방문자는 관리자 화면 코드를 받지 않는다. 렌더 시작 시점에 import()를 걸고
// 커스텀 엘리먼트 등록이 끝나면 브라우저가 업그레이드한다.

// 라우트 가드 (실제 권한은 서버 미들웨어가 이중 강제)
// lit-labs/router의 enter()는 false로 취소만 할 뿐 리다이렉트를 지원하지 않는다.
// 그래서 목적지로 먼저 이동시킨 뒤 false를 반환해 원래 내비게이션을 취소한다.
const requireSession: RouteConfig["enter"] = async () => {
  const user = await session.ensure();
  if (!user) {
    // 세션 확인 자체가 실패(5xx·오프라인)한 것이지 비로그인이 아니다 — /login 으로
    // 밀어내면 로그인해도 같은 오류를 다시 만난다. 공개 페이지로 돌려 확인을 재시도하게 둔다
    if (session.unreachable) {
      navigate("/");
      return false;
    }
    redirect("/login");
    return false;
  }
  return true;
};

// admin 전용 — /admin/* 진입 가드 (실제 권한은 서버가 이중 강제)
const requireAdmin: RouteConfig["enter"] = async () => {
  const user = await session.ensure();
  if (!user) {
    if (session.unreachable) {
      navigate("/");
      return false;
    }
    redirect("/login");
    return false;
  }
  if (user.role !== "admin") {
    redirect("/?role=denied"); // 안내는 home(denied 배너)이 표시 — 냉무 리다이렉트 회피()
    return false;
  }
  return true;
};

// 경로 파라미터는 render()가 컴포넌트 프로퍼티로 주입한다
const routes: RouteConfig[] = [
  { path: "/", render: () => html`<page-home></page-home>` },
  {
    path: "/items/:id",
    render: (params) => {
      void import("./pages/item-detail");
      return html`<page-item-detail .itemId=${params.id ?? ""}></page-item-detail>`;
    },
  },
  {
    path: "/login",
    render: () => {
      void import("./pages/login");
      return html`<page-login></page-login>`;
    },
  },
  {
    path: "/mypage",
    render: () => {
      void import("./pages/mypage");
      return html`<page-mypage></page-mypage>`;
    },
    enter: requireSession,
  },
  {
    path: "/my/rentals",
    render: () => {
      void import("./pages/my-rentals");
      return html`<page-my-rentals></page-my-rentals>`;
    },
    enter: requireSession,
  },
  {
    path: "/signup/profile",
    render: () => {
      void import("./pages/signup-profile");
      return html`<page-signup-profile></page-signup-profile>`;
    },
    enter: requireSession,
  },
  {
    path: "/admin",
    render: () => {
      void import("./pages/admin/dashboard");
      return html`<page-admin-dashboard></page-admin-dashboard>`;
    },
    enter: requireAdmin,
  },
  {
    path: "/admin/items",
    render: () => {
      void import("./pages/admin/items");
      return html`<page-admin-items></page-admin-items>`;
    },
    enter: requireAdmin,
  },
  {
    path: "/admin/reservations",
    render: () => {
      void import("./pages/admin/reservations");
      return html`<page-admin-reservations></page-admin-reservations>`;
    },
    enter: requireAdmin,
  },
  {
    path: "/admin/members",
    render: () => {
      void import("./pages/admin/members");
      return html`<page-admin-members></page-admin-members>`;
    },
    enter: requireAdmin,
  },
  {
    path: "/admin/allowed-emails",
    render: () => {
      void import("./pages/admin/allowed-emails");
      return html`<page-admin-allowed-emails></page-admin-allowed-emails>`;
    },
    enter: requireAdmin,
  },
  {
    path: "/policy/:kind",
    render: (params) => {
      void import("./pages/policy");
      return html`<page-policy
        .kind=${params.kind === "terms" ? "terms" : "privacy"}
      ></page-policy>`;
    },
  },
];

// 매칭 실패 → 404
const fallback = {
  render: () => {
    void import("./pages/not-found");
    return html`<page-not-found></page-not-found>`;
  },
};

// 풀 리로드가 사라져 브라우저의 스크롤 리셋도 사라졌다.
// Router는 내비게이션 이벤트를 내지 않으므로 goto()를 감싸 링크 클릭·popstate·navigate를 모두 잡는다.
class AppRouter extends Router {
  async goto(pathname: string) {
    await super.goto(pathname);
    window.scrollTo(0, 0);
  }
}

let routerInstance: Router | null = null;

// app-shell이 소유하는 라우터 — Router는 host의 ReactiveController로 붙는다.
// 링크 클릭 가로채기(SPA 이동)는 Router가 window에 직접 설치하므로 별도 리스너가 필요 없다.
export function createRouter(
  host: ReactiveControllerHost & HTMLElement,
): Router {
  const router = new AppRouter(host, routes, { fallback });
  routerInstance = router;
  return router;
}

// 컴포넌트에서 SPA 내 이동할 때 사용
// goto()는 pathname만 매칭하므로 search·hash는 pushState로 URL에만 반영한다
export function navigate(path: string) {
  if (!routerInstance) {
    window.location.assign(path);
    return;
  }
  const u = new URL(path, location.origin);
  const target = u.pathname + u.search + u.hash;
  if (target !== location.pathname + location.search + location.hash) {
    window.history.pushState({}, "", target);
  }
  void routerInstance.goto(u.pathname);
}

// 가드 리다이렉트 — 방금 pushState된 보호 경로를 히스토리에 남기지 않는다(replaceState)
function redirect(path: string) {
  if (!routerInstance) {
    window.location.assign(path);
    return;
  }
  const u = new URL(path, location.origin);
  window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  void routerInstance.goto(u.pathname);
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
