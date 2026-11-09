import { Show, createSignal } from "solid-js";
import { session } from "../context/session";
import { navigate, syncScrollKey } from "../router";
import { Button } from "../components/ui/button";
import { Chip } from "../components/ui/chip";
import { Notice } from "../components/ui/notice";
import { PageHeader } from "../components/ui/page-header";
import { SearchIcon } from "../components/icons";
import {
  ItemExplorer,
  type TabKey,
} from "../components/features/item/item-explorer";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "available", label: "대여 가능" },
  { key: "reserved", label: "예약 가능" },
  { key: "rented", label: "대여 중" },
  { key: "repair", label: "수리 중" },
];

export default function Home() {
  const params = new URLSearchParams(window.location.search);
  const initialTab = (): TabKey => {
    const state = params.get("state");
    return state === "available" ||
      state === "reserved" ||
      state === "rented" ||
      state === "repair"
      ? state
      : "all";
  };
  const [q, setQ] = createSignal(params.get("q") ?? "");
  const [tab, setTab] = createSignal<TabKey>(initialTab());
  const denied = params.get("role") === "denied";

  if (denied) {
    window.history.replaceState(null, "", "/");
    syncScrollKey();
  }

  const isAdmin = () => session.isAdmin();

  const syncUrl = (nextQ: string, nextTab: TabKey) => {
    const next = new URLSearchParams(window.location.search);
    if (nextQ) next.set("q", nextQ);
    else next.delete("q");
    if (nextTab !== "all") next.set("state", nextTab);
    else next.delete("state");
    const qs = next.toString();
    const target = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    if (target !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", target);
      syncScrollKey();
    }
  };

  const onSearch = (value: string) => {
    setQ(value);
    syncUrl(value, tab());
  };

  const onTabChange = (value: string) => {
    const next = value as TabKey;
    setTab(next);
    syncUrl(q(), next);
  };

  const clearSearch = () => {
    setQ("");
    syncUrl("", tab());
  };

  return (
    <div class="block">
      <PageHeader
        title="물품 현황"
        subtitle="함께 쓰는 물품과 대여 상태를 확인합니다."
      />

      <div class="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div class="max-w-[560px] lg:col-start-1 lg:row-start-1 lg:max-w-[400px]">
          <div class="relative w-full">
            <Show when={!q()}>
              <SearchIcon class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />
            </Show>
            <input
              class="box-border h-10 w-full min-w-0 rounded-card border border-line bg-surface py-2 pr-10 pl-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
              type="search"
              aria-label="물품 검색"
              placeholder="이름, 위치, 분류 검색"
              value={q()}
              onInput={(event) => onSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && q()) {
                  event.preventDefault();
                  clearSearch();
                }
              }}
            />
            <Show when={q()}>
              <button
                type="button"
                class="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-fine text-ink-2 hover:bg-surface-muted hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
                aria-label="검색어 지우기"
                title="검색어 지우기"
                onClick={clearSearch}
              >
                ✕
              </button>
            </Show>
          </div>
        </div>

        <aside class="home-side flex flex-col gap-4 max-lg:hidden lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="물품 등록과 대여 안내">
          <Show when={isAdmin()}>
            <Button variant="primary" onClick={() => navigate("/items/new")}>
              물품 등록
            </Button>
          </Show>

          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
              {isAdmin() ? "관리자 안내" : "대여 안내"}
            </h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              {isAdmin()
                ? "물품 등록·수정과 반납 처리는 상단 메뉴에서 할 수 있습니다."
                : "신청 후 관리자가 승인하면 대여가 시작됩니다. 진행 상황은 대여 내역에서 확인합니다."}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Show when={isAdmin()}>
                <a
                  class="inline-flex h-10 items-center rounded-card border border-line bg-surface px-3 text-fine font-medium text-ink-1 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
                  href="/admin/reservations"
                >
                  대여 관리
                </a>
              </Show>
              <a
                class="inline-flex h-10 items-center rounded-card border border-line bg-surface px-3 text-fine font-medium text-ink-1 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
                href="/my/rentals"
              >
                대여 내역
              </a>
            </div>
          </section>
        </aside>

        <div class="min-w-0 lg:col-start-1 lg:row-start-2">
          <div class="mb-4">
            <Chip
              ariaLabel="물품 상태 필터"
              value={tab()}
              options={TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
              onChange={onTabChange}
            />
          </div>

          <Show when={denied}>
            <div class="mb-4 block">
              <Notice tone="danger" alert>
                관리자 권한이 필요합니다 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없습니다.
              </Notice>
            </div>
          </Show>

          <ItemExplorer q={q()} tab={tab()} onClearSearch={clearSearch} />
        </div>
      </div>
    </div>
  );
}
