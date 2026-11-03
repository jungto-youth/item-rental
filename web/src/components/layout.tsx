import { Show, createEffect, onSettled } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { session } from "../context/session";
import { location, match, titleFor } from "../router";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { PlusIcon } from "./icons";
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
    const known = [
      "/mypage",
      "/signup/profile",
      "/my/rentals",
      "/admin/reservations",
      "/admin/members",
    ];
    if (known.includes(path)) return "default";
    return "surface";
  };

  const showFab = () => session.isAdmin() && loc().pathname === "/";

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
    <div class="app-shell">
      <Show when={!plain()}>
        <AppHeader />
      </Show>

      <main class={plain() ? "plain" : showFab() ? "has-fab" : ""}>
        <Show
          when={match()}
          fallback={
            <div class="route-loading" role="status" aria-label="화면을 불러오는 중">
              <span class="spinner" />
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
        <AppFooter surface={footerMode() === "surface"} />
      </Show>

      <Show when={showFab()}>
        <a class="fab" href="/items/new" aria-label="물품 등록">
          <PlusIcon />
        </a>
      </Show>

      <ConfirmHost />
    </div>
  );
}

export type { PageProps };
