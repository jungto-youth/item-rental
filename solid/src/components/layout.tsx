import { useLocation } from "@solidjs/router";
import logoUrl from "../logo";
import { Show, createSignal, onSettled } from "solid-js";
import { useAppStore } from "../store";
import { Link } from "./link";
import { PlusIcon } from "./icons";

function AccountMenu() {
  const store = useAppStore();
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  onSettled(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!open()) return;
      if (root && !event.composedPath().includes(root)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  const initial = () => store.state.user.name.charAt(0).toUpperCase() || "?";

  return (
    <div ref={root} class="relative ml-auto flex flex-none items-center">
      <button
        type="button"
        class="flex h-10 items-center gap-2 rounded-pill text-body text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={open() ? "true" : "false"}
        aria-haspopup="menu"
        aria-label={`계정 메뉴 — ${store.state.user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          class="flex h-8 w-8 items-center justify-center rounded-pill bg-primary-soft text-fine font-semibold text-primary-strong"
          aria-hidden="true"
        >
          {initial()}
        </span>
        <span class="hidden max-w-[140px] truncate md:block">
          {store.state.user.name}
        </span>
        <svg
          class="hidden h-4 w-4 sm:block"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          class="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[176px] overflow-hidden rounded-card border border-line bg-surface shadow-menu"
          role="menu"
        >
          <Link
            href="/mypage"
            role="menuitem"
            class="block px-4 py-2 text-body text-ink-1 transition-colors hover:bg-surface-muted"
            onClick={() => setOpen(false)}
          >
            내 정보
          </Link>
          <Link
            href="/login"
            role="menuitem"
            class="block px-4 py-2 text-body text-danger transition-colors hover:bg-surface-muted"
            onClick={() => {
              store.setRole("member");
              setOpen(false);
            }}
          >
            로그아웃
          </Link>
        </div>
      </Show>
    </div>
  );
}

export function Header() {
  const store = useAppStore();
  const location = useLocation();

  const isItems = () =>
    location.pathname === "/" ||
    location.pathname === "/items/new" ||
    location.pathname.startsWith("/items/");

  const navClass = (active: boolean) =>
    active
      ? "flex h-14 items-center border-b-2 border-primary text-body font-semibold text-ink-1 sm:h-16"
      : "flex h-14 items-center border-b-2 border-transparent text-body text-ink-2 transition-colors hover:text-ink-1 sm:h-16";

  return (
    <header class="sticky top-0 z-30 border-b border-line bg-surface">
      <div class="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 sm:h-16 sm:gap-6 sm:px-6">
        <Link
          href="/"
          class="flex flex-none items-center gap-2"
          aria-label="물품 현황 — 홈"
        >
          <img src={logoUrl} alt="" class="h-7 w-7 rounded-card" />
        </Link>

        <nav
          class="flex min-w-0 items-center gap-4 sm:gap-6"
          aria-label="주 메뉴"
        >
          <Link href="/" class={navClass(isItems())}>
            물품 현황
          </Link>
          <Show
            when={store.isAdmin()}
            fallback={
              <Link
                href="/my-rentals"
                class={navClass(location.pathname === "/my-rentals")}
              >
                대여 기록
              </Link>
            }
          >
            <Link
              href="/admin/reservations"
              class={navClass(location.pathname === "/admin/reservations")}
            >
              대여 관리
            </Link>
            <Link
              href="/admin/members"
              class={navClass(location.pathname === "/admin/members")}
            >
              회원 관리
            </Link>
          </Show>
        </nav>

        <AccountMenu />
      </div>
    </header>
  );
}

export function PublicHeader() {
  return (
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          class="flex min-w-0 items-center gap-2"
          aria-label="물품 현황 — 홈"
        >
          <img src={logoUrl} alt="" class="h-7 w-7 rounded-card" />
        </Link>
        <Link
          href="/login"
          class="inline-flex h-9 flex-none items-center rounded-card bg-primary-strong px-4 text-body font-semibold text-white transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          로그인
        </Link>
      </div>
    </header>
  );
}

export function Footer(props: { surface?: boolean }) {
  return (
    <footer
      class={`border-t border-line ${props.surface ? "bg-surface" : ""}`}
    >
      <div class="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-8 text-fine text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>정토회 · 함께 쓰는 물품</p>
        <nav class="flex gap-4" aria-label="정책">
          <Link
            href="/policy?kind=terms"
            class="transition-colors hover:text-ink-1 hover:underline"
          >
            이용약관
          </Link>
          <Link
            href="/policy?kind=privacy"
            class="transition-colors hover:text-ink-1 hover:underline"
          >
            개인정보처리방침
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PolicyLinks() {
  return (
    <footer class="flex items-center justify-center gap-4 text-fine text-ink-2">
      <Link
        href="/policy?kind=terms"
        class="transition-colors hover:text-ink-1 hover:underline"
      >
        이용약관
      </Link>
      <span class="text-line-strong" aria-hidden="true">
        ·
      </span>
      <Link
        href="/policy?kind=privacy"
        class="transition-colors hover:text-ink-1 hover:underline"
      >
        개인정보처리방침
      </Link>
    </footer>
  );
}

export function FloatingAddButton() {
  return (
    <Link
      href="/items/new"
      class="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-pill bg-primary-strong text-white shadow-[0_8px_20px_rgba(226,87,30,0.28)] transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
      aria-label="물품 등록"
    >
      <PlusIcon class="h-5 w-5" />
    </Link>
  );
}
