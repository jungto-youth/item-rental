import { createSignal, type Component } from "solid-js";
import { session } from "./context/session";
import { isAffiliationValid } from "../../shared/affiliation";
import { APP_NAME } from "./brand";
import Home from "./pages/home";
import ItemDetail from "./pages/item-detail";
import Login from "./pages/login";
import MyPage from "./pages/mypage";
import MyRentals from "./pages/my-rentals";
import SignupProfile from "./pages/signup-profile";
import Policy from "./pages/policy";
import Design from "./pages/design";
import NotFound from "./pages/not-found";
import AdminItemForm from "./pages/admin/item-form";
import AdminReservations from "./pages/admin/reservations";
import AdminMembers from "./pages/admin/members";

export type PageProps = { params: Record<string, string> };
export type Location = { pathname: string; search: string; hash: string };

type Guard = "session" | "admin";

type RouteDef = {
  pattern: string;
  component: Component<PageProps>;
  guard?: Guard;
  title: (params: Record<string, string>, search: string) => string;
};

export type Match = { route: RouteDef; params: Record<string, string> };

// 연락처가 없는 회원은 역할과 무관하게 이 화면에서 전화번호를 먼저 받는다.
const PROFILE_ROUTE = "/signup/profile";

const routes: RouteDef[] = [
  {
    pattern: "/",
    component: Home,
    guard: "session",
    title: () => `물품 현황 — ${APP_NAME}`,
  },
  {
    pattern: "/items/new",
    component: AdminItemForm,
    guard: "admin",
    title: () => `물품 등록 — ${APP_NAME}`,
  },
  {
    pattern: "/items/:id/edit",
    component: AdminItemForm,
    guard: "admin",
    title: () => `물품 수정 — ${APP_NAME}`,
  },
  {
    pattern: "/items/:id",
    component: ItemDetail,
    guard: "session",
    title: () => `물품 상세 — ${APP_NAME}`,
  },
  {
    pattern: "/login",
    component: Login,
    title: () => `로그인 — ${APP_NAME}`,
  },
  {
    pattern: "/mypage",
    component: MyPage,
    guard: "session",
    title: () => `내 정보 — ${APP_NAME}`,
  },
  {
    pattern: "/my/rentals",
    component: MyRentals,
    guard: "session",
    title: () => `대여 내역 — ${APP_NAME}`,
  },
  {
    pattern: "/signup/profile",
    component: SignupProfile,
    guard: "session",
    title: () => `프로필 등록 — ${APP_NAME}`,
  },
  {
    pattern: "/design",
    component: Design,
    title: () => `디자인 시스템 — ${APP_NAME}`,
  },
  {
    pattern: "/admin/reservations",
    component: AdminReservations,
    guard: "admin",
    title: () => `대여 관리 — ${APP_NAME}`,
  },
  {
    pattern: "/admin/members",
    component: AdminMembers,
    guard: "admin",
    title: () => `회원 관리 — ${APP_NAME}`,
  },
  {
    pattern: "/policy/:kind",
    component: Policy,
    title: (_params, search) =>
      new URLSearchParams(search).get("kind") === "terms" ||
      _params.kind === "terms"
        ? `이용약관 — ${APP_NAME}`
        : `개인정보 처리방침 — ${APP_NAME}`,
  },
];

const fallbackRoute: RouteDef = {
  pattern: "*",
  component: NotFound,
  title: () => `페이지를 찾을 수 없습니다 — ${APP_NAME}`,
};

function readLocation(): Location {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function keyOf(loc: Location): string {
  return loc.pathname + loc.search;
}

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function matchRoute(pathname: string): Match {
  const path = normalize(pathname);
  const segments = path.split("/").filter(Boolean);

  for (const route of routes) {
    const patternSegments = route.pattern.split("/").filter(Boolean);
    if (patternSegments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < patternSegments.length; i++) {
      const pattern = patternSegments[i];
      if (pattern.startsWith(":")) {
        params[pattern.slice(1)] = decodeURIComponent(segments[i]);
      } else if (pattern !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return { route: fallbackRoute, params: {} };
}

const [location, setLocation] = createSignal<Location>(readLocation());
const [match, setMatch] = createSignal<Match | null>(null);
const [pending, setPending] = createSignal(false);

export { location, match, pending };

// ===== 스크롤 위치 =====
const SCROLL_STORE_LIMIT = 50;
const scrollStore = new Map<string, number>();
let currentKey = keyOf(readLocation());
let popstateEntry = false;

function saveScroll(key: string, top: number) {
  if (scrollStore.size >= SCROLL_STORE_LIMIT && !scrollStore.has(key)) {
    const oldest = scrollStore.keys().next().value;
    if (oldest !== undefined) scrollStore.delete(oldest);
  }
  scrollStore.set(key, top);
}

function scrollToPreserving(top: number) {
  let tries = 0;
  const apply = () => {
    window.scrollTo(0, top);
    const maxTop = document.documentElement.scrollHeight - window.innerHeight;
    if (top > maxTop && tries++ < 20) {
      requestAnimationFrame(apply);
      return;
    }
    scrollStore.set(keyOf(readLocation()), window.scrollY);
  };
  apply();
}

export function syncScrollKey() {
  currentKey = keyOf(readLocation());
}

// ===== 내비게이션 =====
let seq = 0;

function redirectTo(path: string) {
  const u = new URL(path, window.location.origin);
  window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  popstateEntry = false;
  void resolve();
}

async function resolve() {
  const my = ++seq;
  const target = readLocation();
  const next = matchRoute(target.pathname);
  const guard = next.route.guard;

  if (guard) {
    setPending(true);
    const user =
      guard === "admin" ? await session.ensure() : await session.refresh();
    if (my !== seq) return;
    if (!user) {
      setPending(false);
      redirectTo(session.unreachable() ? "/login?error=SessionUnavailable" : "/login");
      return;
    }
    if (guard === "admin" && user.role !== "admin") {
      setPending(false);
      redirectTo("/?role=denied");
      return;
    }
    // 관리자를 포함한 모든 회원 — 연락처·지회·모둠이 없으면 프로필 등록으로 보낸다.
    // 프로필 화면 자체는 막지 않는다(입력 후 저장하면 다음 이동부터 통과).
    if (
      (!user.phone || !isAffiliationValid(user.affiliation)) &&
      next.route.pattern !== PROFILE_ROUTE
    ) {
      setPending(false);
      redirectTo(PROFILE_ROUTE);
      return;
    }
  }

  if (my !== seq) return;
  setPending(false);

  const fromPopstate = popstateEntry;
  popstateEntry = false;
  const nextKey = keyOf(target);
  const saved = fromPopstate ? scrollStore.get(nextKey) : undefined;

  setLocation(target);
  setMatch(next);
  currentKey = nextKey;

  if (saved !== undefined) scrollToPreserving(saved);
  else window.scrollTo(0, 0);
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const u = new URL(path, window.location.origin);
  const target = u.pathname + u.search + u.hash;
  const here = window.location.pathname + window.location.search + window.location.hash;
  if (target === here) return;
  saveScroll(currentKey, window.scrollY);
  if (opts.replace) window.history.replaceState({}, "", target);
  else window.history.pushState({}, "", target);
  void resolve();
}

export function goBack() {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}

window.addEventListener("popstate", () => {
  popstateEntry = true;
  saveScroll(currentKey, window.scrollY);
  void resolve();
});

// 링크 클릭 가로채기 — 같은 출처의 일반 링크만 SPA 이동으로 바꾼다.
document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = (event.target as Element | null)?.closest?.(
    "a[href]",
  ) as HTMLAnchorElement | null;
  if (!anchor) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  const same =
    url.pathname === window.location.pathname &&
    url.search === window.location.search;
  // 같은 화면의 목차 앵커는 브라우저 기본 스크롤을 쓴다.
  if (same && url.hash) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

export function titleFor(loc: Location): string {
  const next = matchRoute(loc.pathname);
  return next.route.title(next.params, loc.search);
}

void resolve();
