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
  { key: "rented", label: "대여 중" },
  { key: "repair", label: "수리 중" },
];

export default function Home() {
  const params = new URLSearchParams(window.location.search);
  const [q, setQ] = createSignal(params.get("q") ?? "");
  const [tab, setTab] = createSignal<TabKey>("all");
  const denied = params.get("role") === "denied";

  if (denied) {
    window.history.replaceState(null, "", "/");
    syncScrollKey();
  }

  const isAdmin = () => session.isAdmin();

  const syncSearchUrl = (value: string) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set("q", value);
    else next.delete("q");
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
    syncSearchUrl(value);
  };

  const clearSearch = () => {
    setQ("");
    syncSearchUrl("");
  };

  return (
    <div class="page-home">
      <PageHeader
        title="물품 현황"
        subtitle="함께 쓰는 물품과 대여 상태를 확인해요."
      />

      <div class="home-layout">
        <div class="home-search">
          <div class="controls">
            <SearchIcon class="search-icon" />
            <input
              class="search-input search"
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
                class="clear-btn"
                aria-label="검색어 지우기"
                title="검색어 지우기"
                onClick={clearSearch}
              >
                ✕
              </button>
            </Show>
          </div>
        </div>

        <aside class="home-side" aria-label="물품 등록과 대여 안내">
          <Show when={isAdmin()}>
            <Button variant="primary" onClick={() => navigate("/items/new")}>
              물품 등록
            </Button>
          </Show>

          <section class="side-card">
            <h2>대여 안내</h2>
            <p>신청하면 바로 대여 중이 돼요. 반납은 대여 기록에서 할 수 있어요.</p>
            <a href="/my/rentals">내 대여 보기</a>
          </section>
        </aside>

        <div class="home-main">
          <div class="filters">
            <Chip
              ariaLabel="물품 상태 필터"
              value={tab()}
              options={TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
              onChange={(value) => setTab(value as TabKey)}
            />
          </div>

          <Show when={denied}>
            <div class="notice">
              <Notice tone="danger" alert>
                관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
              </Notice>
            </div>
          </Show>

          <ItemExplorer q={q()} tab={tab()} onClearSearch={clearSearch} />
        </div>
      </div>
    </div>
  );
}
