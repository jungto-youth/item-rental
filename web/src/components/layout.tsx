import { Show, createEffect, onSettled, untrack } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { session } from "../context/session";
import { cart } from "../context/cart";
import { location, match, titleFor } from "../router";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { PlusIcon } from "./icons";
import { CartBar } from "./features/cart/cart-bar";
import { ConfirmHost } from "../utils/confirm";
import type { PageProps } from "../router";

export function Shell() {
  const loc = location;
  const plain = () =>
    loc().pathname === "/login" || loc().pathname === "/signup/profile";

  const footerMode = (): "none" | "default" | "surface" => {
    if (plain()) return "none";
    const path = loc().pathname;
    if (path === "/") return "default";
    if (path.startsWith("/policy/")) return "default";
    if (path === "/items/new" || path.endsWith("/edit")) return "default";
    if (path.startsWith("/items/")) return "default";
    if (path.startsWith("/inquiries")) return "default";
    const known = [
      "/mypage",
      "/signup/profile",
      "/my/rentals",
      "/admin/reservations",
      "/admin/members",
      "/admin/inquiries",
      "/design",
    ];
    if (known.includes(path)) return "default";
    return "surface";
  };

  const showFab = () => session.isAdmin() && loc().pathname === "/";
  const showCartBar = () =>
    !session.isAdmin() && loc().pathname === "/" && cart.count() > 0;

  // 하단 고정 바가 본문·푸터의 마지막 줄을 가리지 않게 같은 높이만큼 비운다.
  const mainBottomPad = () => {
    if (showCartBar()) {
      return "pb-[calc(88px+env(safe-area-inset-bottom,0px))]";
    }
    if (showFab()) {
      return "pb-[calc(16px+env(safe-area-inset-bottom,0px))] max-lg:pb-[calc(80px+env(safe-area-inset-bottom,0px))]";
    }
    return "pb-[calc(16px+env(safe-area-inset-bottom,0px))]";
  };

  // 장바구니는 회원별로 저장한다 — 로그인 사용자가 바뀔 때만 저장소에서 읽는다.
  createEffect(
    () => session.user()?.id ?? null,
    (userId) => untrack(() => cart.syncToUser(userId)),
  );

  createEffect(
    () => loc(),
    (current) => {
      document.title = titleFor(current);
    },
  );

  // 공개 화면(정책·404)에서도 헤더가 로그인 사용자를 보여주도록 세션을 한 번 읽는다.
  onSettled(() => {
    void session.ensure();
  });

  return (
    <div class="flex min-h-dvh flex-col">
      <Show when={!plain()}>
        <AppHeader />
      </Show>

      <main
        class={`w-full flex-1 text-body ${
          plain()
            ? "max-w-none p-0"
            : `mx-auto max-w-layout p-4 ${mainBottomPad()}`
        }`}
      >
        <Show
          when={match()}
          fallback={
            <div
              class="flex min-h-[60vh] items-center justify-center"
              role="status"
              aria-label="화면을 불러오는 중"
            >
              <span class="size-4 animate-[spin_0.6s_linear_infinite] rounded-full border-2 border-ink-2 border-r-transparent" />
            </div>
          }
        >
          {(current) => (
            <Dynamic
              component={current().route.component}
              params={current().params}
            />
          )}
        </Show>
      </main>

      <Show when={footerMode() !== "none"}>
        <div
          class={
            showCartBar()
              ? "pb-[calc(72px+env(safe-area-inset-bottom,0px))]"
              : ""
          }
        >
          <AppFooter surface={footerMode() === "surface"} />
        </div>
      </Show>

      <Show when={showCartBar()}>
        <CartBar />
      </Show>

      <Show when={showFab()}>
        <a
          class="hidden max-lg:fixed max-lg:right-4 max-lg:bottom-[calc(16px+env(safe-area-inset-bottom,0px))] max-lg:z-20 max-lg:flex max-lg:size-12 max-lg:items-center max-lg:justify-center max-lg:rounded-pill max-lg:border max-lg:border-primary-strong max-lg:bg-primary-strong max-lg:text-white max-lg:shadow-[0_8px_20px_rgba(226,87,30,0.28)] max-lg:transition-colors max-lg:hover:border-primary-deep max-lg:hover:bg-primary-deep max-lg:focus-visible:outline-2 max-lg:focus-visible:outline-offset-2 max-lg:focus-visible:outline-ink-1 [&_svg]:max-lg:size-5"
          href="/items/new"
          aria-label="물품 등록"
        >
          <PlusIcon />
        </a>
      </Show>

      <ConfirmHost />
    </div>
  );
}

export type { PageProps };
