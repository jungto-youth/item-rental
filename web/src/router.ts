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
    // 물품 등록 — 상세 :id 매칭보다 먼저 둔다
    path: "/items/new",
    render: () => {
      void import("./pages/admin/item-form");
      return html`<page-admin-item-form itemId="new"></page-admin-item-form>`;
    },
    enter: requireAdmin,
  },
  {
    // 물품 수정
    path: "/items/:id/edit",
    render: (params) => {
      void import("./pages/admin/item-form");
      return html`<page-admin-item-form .itemId=${params.id ?? ""}></page-admin-item-form>`;
    },
    enter: requireAdmin,
  },
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

// ===== 스크롤 위치 관리 =====
// SPA는 풀 리로드가 없어 브라우저의 자동 스크롤 복원도 없다. 그런데 모든 이동에서
// scrollTo(0,0)만 하면 "목록 하단 → 상세 → 뒤로가기"에서 사용자가 또 리스트 끝까지
// 스크롤을 다시 내려야 한다. 그래서 이동을 두 종류로 나눈다.
//   - 새 화면 진입(링크 클릭·navigate/redirect)  → 맨 위로
//   - 뒤로가기/앞으로가기(popstate)              → 떠난 자리에 복원
// 목록이 데이터 로드 뒤에 길어지는 화면도 있으므로 복원은 몇 프레임 재시도한다.

// popstate 진입 표시. @lit-labs/router는 popstate에서 곧바로 this.goto()를 부르므로
// 수신 순서가 중요하다 — 이 리스너를 모듈 평가 시점(라우터가 hostConnected에서
// 자기 리스너를 붙이기 전)에 등록해 먼저 실행되게 한다.
let popstateEntry = false;
window.addEventListener("popstate", () => {
  popstateEntry = true;
});

// 화면별 스크롤 위치 저장소 — 앱이 현재 표시 중인 경로(경로+쿼리)를 키로 삼는다.
const SCROLL_STORE_LIMIT = 50;
const scrollStore = new Map<string, number>();
let currentKey = location.pathname + location.search;

function pageKey(): string {
  return location.pathname + location.search;
}

function saveScroll(key: string, top: number) {
  // 오래된 항목부터 버려 저장소가 무한히 커지지 않게 한다
  if (scrollStore.size >= SCROLL_STORE_LIMIT && !scrollStore.has(key)) {
    const oldest = scrollStore.keys().next().value;
    if (oldest !== undefined) scrollStore.delete(oldest);
  }
  scrollStore.set(key, top);
}

// 문서가 아직 충분히 길지 않으면 스크롤이 묶인다(목록 데이터 로드 전 등).
// 최대 ~300ms 동안 프레임마다 다시 시도한다.
function scrollToPreserving(top: number) {
  let tries = 0;
  const apply = () => {
    window.scrollTo(0, top);
    const maxTop = document.documentElement.scrollHeight - window.innerHeight;
    if (top > maxTop && tries++ < 20) {
      requestAnimationFrame(apply);
      return;
    }
    scrollStore.set(pageKey(), window.scrollY);
  };
  apply();
}

// Router는 내비게이션 이벤트를 내지 않으므로 goto()를 감싸 링크 클릭·popstate·navigate를 모두 잡는다.
// 링크 클릭·popstate 모두 URL이 이미 새 값으로 바뀐 뒤 goto()가 불리므로, "어떤 화면을
// 떠나고 있는가"는 앱이 직접 추적한 currentKey 로만 알 수 있다.
class AppRouter extends Router {
  async goto(pathname: string) {
    const fromPopstate = popstateEntry;
    popstateEntry = false;
    // 떠나던 화면의 위치 기억 — 뒤로가기로 되돌아올 때 되살릴 값
    saveScroll(currentKey, window.scrollY);
    await super.goto(pathname);
    currentKey = pageKey();
    const saved = fromPopstate ? scrollStore.get(currentKey) : undefined;
    if (saved !== undefined) {
      scrollToPreserving(saved);
    } else {
      window.scrollTo(0, 0);
    }
  }
}

// replaceState 로 화면이 자기 URL을 직접 바꾸는 경우(검색어 ?q= 반영)에는
// 라우터를 거치지 않으므로 추적 키를 직접 맞춰 준다 — 안 맞추면 스크롤 위치가
// 옛 경로 이름으로 저장돼 복원이 안 된다.
export function syncScrollKey() {
  currentKey = pageKey();
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
