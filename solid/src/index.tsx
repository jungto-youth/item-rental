import {
  createRouter,
  hashHistory,
  useLocation,
} from "@solidjs/router";
import { Show, createEffect, type ParentComponent } from "solid-js";
import { render } from "@solidjs/web";
import {
  FloatingAddButton,
  Footer,
  Header,
  PublicHeader,
} from "./components/layout";
import { StoreProvider, useAppStore } from "./store";
import "./styles.css";
import AdminMembers from "./pages/admin-members";
import AdminReservations from "./pages/admin-reservations";
import Home from "./pages/home";
import ItemDetail from "./pages/item-detail";
import ItemForm from "./pages/item-form";
import Login from "./pages/login";
import MyPage from "./pages/mypage";
import MyRentals from "./pages/my-rentals";
import NotFound from "./pages/not-found";
import Policy from "./pages/policy";
import SignupProfile from "./pages/signup-profile";
import States from "./pages/states";

function isKnownPath(path: string) {
  return (
    path === "/" ||
    path === "/login" ||
    path === "/signup-profile" ||
    path === "/mypage" ||
    path === "/my-rentals" ||
    path === "/admin/reservations" ||
    path === "/admin/members" ||
    path === "/policy" ||
    path === "/states" ||
    path === "/404" ||
    path === "/items/new" ||
    /^\/items\/[^/]+(\/edit)?$/.test(path)
  );
}

function titleFor(path: string, search: string) {
  if (path === "/") return "물품 현황 — 물품 대여";
  if (path === "/login") return "로그인 — 물품 대여";
  if (path === "/signup-profile") return "프로필 등록 — 물품 대여";
  if (path === "/mypage") return "내 정보 — 물품 대여";
  if (path === "/my-rentals") return "대여 내역 — 물품 대여";
  if (path === "/admin/reservations") return "대여 관리 — 물품 대여";
  if (path === "/admin/members") return "회원 관리 — 물품 대여";
  if (path === "/states") return "상태 화면 — 물품 대여";
  if (path === "/policy") {
    return new URLSearchParams(search).get("kind") === "terms"
      ? "이용약관 — 물품 대여"
      : "개인정보 처리방침 — 물품 대여";
  }
  if (path === "/items/new") return "물품 등록 — 물품 대여";
  if (/^\/items\/[^/]+\/edit$/.test(path)) return "물품 수정 — 물품 대여";
  if (/^\/items\/[^/]+$/.test(path)) return "물품 상세 — 물품 대여";
  return "페이지를 찾을 수 없어요 — 물품 대여";
}

const Shell: ParentComponent = (props) => {
  const location = useLocation();
  const store = useAppStore();

  const plain = () =>
    location.pathname === "/login" ||
    location.pathname === "/signup-profile";
  const notFound = () =>
    location.pathname === "/404" || !isKnownPath(location.pathname);

  createEffect(
    () => titleFor(location.pathname, location.search),
    (title) => {
      document.title = title;
    },
  );

  return (
    <div class="flex min-h-dvh flex-col antialiased">
      <Show when={!plain()}>
        <Show when={!notFound()} fallback={<PublicHeader />}>
          <Header />
        </Show>
      </Show>

      {props.children}

      <Show when={!plain()}>
        <Footer surface={notFound()} />
      </Show>

      <Show
        when={
          !plain() &&
          !notFound() &&
          location.pathname === "/" &&
          store.isAdmin()
        }
      >
        <FloatingAddButton />
      </Show>
    </div>
  );
};

const Router = createRouter({
  history: hashHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/items/new", component: ItemForm },
    { path: "/items/:id/edit", component: ItemForm },
    { path: "/items/:id", component: ItemDetail },
    { path: "/login", component: Login },
    { path: "/signup-profile", component: SignupProfile },
    { path: "/mypage", component: MyPage },
    { path: "/my-rentals", component: MyRentals },
    { path: "/admin/reservations", component: AdminReservations },
    { path: "/admin/members", component: AdminMembers },
    { path: "/policy", component: Policy },
    { path: "/states", component: States },
    { path: "/404", component: NotFound },
    { path: "*404", component: NotFound },
  ],
});

function App() {
  return (
    <StoreProvider>
      <Router>{(props) => <Shell {...props} />}</Router>
    </StoreProvider>
  );
}

render(() => <App />, document.getElementById("root")!);
