import { Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { location, navigate } from "../router";
import { ChevronDownIcon } from "./icons";

type NavItem = { href: string; label: string };

export function AppHeader() {
  const [menuOpen, setMenuOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const user = () => session.user();
  const route = () => location().pathname;

  const navItems = (): NavItem[] => {
    const current = user();
    if (!current) return [];
    const admin = current.role === "admin";
    return [
      { href: "/", label: "물품 현황" },
      admin
        ? { href: "/admin/reservations", label: "대여 관리" }
        : { href: "/my/rentals", label: "대여 기록" },
      ...(admin ? [{ href: "/admin/members", label: "회원 관리" }] : []),
    ];
  };

  const isActive = (href: string) => {
    const path = route();
    if (href === "/") return path === "/" || path.startsWith("/items");
    return path === href || path.startsWith(`${href}/`);
  };

  const accountLabel = () => user()?.name || user()?.email || "";
  const accountInitial = () => accountLabel().trim().charAt(0).toUpperCase();

  const signOut = async () => {
    setMenuOpen(false);
    try {
      const csrfRes = await fetch("/api/auth/csrf", {
        signal: AbortSignal.timeout(10_000),
      });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // 네트워크 오류 — 로컬 세션은 비운다
    }
    session.clear();
    await session.refresh();
    navigate("/");
  };

  onSettled(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuOpen()) return;
      if (root && !event.composedPath().includes(root)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <header class="app-header">
      <div class="bar">
        <a href="/" class="brand" aria-label="물품 현황 — 홈">
          <img src="/logo.png" alt="" />
        </a>

        <Show
          when={user()}
          fallback={
            <a class="btn-login" href="/login">
              로그인
            </a>
          }
        >
          <nav class="nav" aria-label="주 메뉴">
            <Show when={user()}>
              {navItems().map((item) => (
                <a
                  href={item.href}
                  class={isActive(item.href) ? "active" : ""}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </Show>
          </nav>

          <div class="account" ref={root}>
            <button
              type="button"
              class="account-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen() ? "true" : "false"}
              aria-label={`계정 메뉴 — ${accountLabel()}`}
              title="계정 메뉴"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span class="avatar" aria-hidden="true">
                {accountInitial()}
              </span>
              <span class="account-name">{accountLabel()}</span>
              <ChevronDownIcon class="account-chevron" />
            </button>
            <Show when={menuOpen()}>
              <div class="menu" role="menu">
                <a role="menuitem" href="/mypage" onClick={() => setMenuOpen(false)}>
                  내 정보
                </a>
                <button
                  type="button"
                  role="menuitem"
                  class="menu-logout"
                  onClick={() => void signOut()}
                >
                  로그아웃
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </header>
  );
}
