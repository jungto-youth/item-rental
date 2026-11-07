import { Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { location, navigate } from "../router";
import { APP_NAME, APP_NAME_SHORT } from "../brand";
import { BrandLogo } from "./brand-logo";
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
      ...(admin
        ? [
            { href: "/admin/reservations", label: "대여 관리" },
            { href: "/admin/members", label: "회원 관리" },
          ]
        : []),
      // 관리자도 내가 빌린 물품을 확인할 수 있어야 한다. 관리자 메뉴(대여 관리)와
      // 별개로 '대여 내역'을 항상 둔다 — 예전에는 관리자에게서 이 진입점이 사라져
      // 대여 내역에 들어갈 방법이 없었다 (BACKLOG B-02).
      { href: "/my/rentals", label: "대여 내역" },
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

  const navLinkClass = (href: string) =>
    `flex h-full shrink-0 items-center border-b-2 text-body whitespace-nowrap no-underline hover:text-ink-1 ${
      isActive(href)
        ? "border-primary font-semibold text-ink-1"
        : "border-transparent text-ink-2"
    }`;

  return (
    <header class="sticky top-0 z-10 h-14 border-b border-line bg-surface md:h-16">
      <div class="mx-auto flex h-full w-full max-w-layout items-center gap-4 px-4 md:gap-6 md:px-6">
        <a
          href="/"
          class="flex shrink-0 items-center no-underline"
          aria-label={`${APP_NAME} — 홈`}
        >
          <BrandLogo />
          {/* 모바일은 로고만 — 메뉴·계정 버튼과 겹치지 않게 데스크톱에서만 축약명을 보인다. */}
          <span class="ml-2 hidden text-body font-semibold tracking-tight text-ink-1 lg:inline">
            {APP_NAME_SHORT}
          </span>
        </a>

        <Show
          when={user()}
          fallback={
            <a
              class="ml-auto flex h-10 items-center rounded-card border border-primary-strong bg-primary-strong px-4 text-body font-semibold tracking-tight text-white no-underline hover:border-primary-deep hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
              href="/login"
            >
              로그인
            </a>
          }
        >
          <nav
            class="flex min-w-0 items-stretch gap-6 self-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="주 메뉴"
          >
            <Show when={user()}>
              {navItems().map((item) => (
                <a
                  href={item.href}
                  class={navLinkClass(item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </Show>
          </nav>

          <div class="relative ml-auto shrink-0" ref={root}>
            <button
              type="button"
              class="flex h-10 cursor-pointer items-center gap-2 rounded-pill text-body text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
              aria-haspopup="menu"
              aria-expanded={menuOpen() ? "true" : "false"}
              aria-label={`계정 메뉴 — ${accountLabel()}`}
              title="계정 메뉴"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span
                class="flex size-8 items-center justify-center rounded-pill bg-primary-soft text-fine font-semibold text-primary-strong"
                aria-hidden="true"
              >
                {accountInitial()}
              </span>
              <span class="max-w-[140px] truncate text-body text-ink-2 max-md:hidden">
                {accountLabel()}
              </span>
              <ChevronDownIcon class="hidden size-4 shrink-0 text-ink-2 sm:block" />
            </button>
            <Show when={menuOpen()}>
              <div
                class="absolute top-[calc(100%+8px)] right-0 z-20 min-w-[176px] overflow-hidden rounded-card border border-line bg-surface shadow-menu"
                role="menu"
              >
                <a
                  role="menuitem"
                  href="/mypage"
                  class="block w-full p-4 text-left text-body text-ink-1 no-underline hover:bg-surface-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  내 정보
                </a>
                <a
                  role="menuitem"
                  href="/my/rentals"
                  class="block w-full p-4 text-left text-body text-ink-1 no-underline hover:bg-surface-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  대여 내역
                </a>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full cursor-pointer border-0 bg-transparent p-4 text-left text-body text-danger hover:bg-surface-muted"
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
