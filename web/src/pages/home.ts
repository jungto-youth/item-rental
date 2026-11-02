import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate, syncScrollKey } from "../router";
import { session } from "../context/session";
import { type CatalogSummary } from "../types";
import { reduceMotion } from "../styles/motion";
import { searchFieldCss, sideCardCss } from "../styles/ui";
import "../components/ui/button";
import "../components/ui/chip";
import "../components/ui/page-header";
import "../components/ui/notice";
import "../components/features/item/item-explorer";

type TabKey = "all" | "available" | "rented" | "repair";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "available", label: "대여 가능" },
  { key: "rented", label: "대여 중" },
  { key: "repair", label: "수리 중" },
];

// 물품 현황 — 페이지 제목·검색·필터·등록 액션을 소유한다.
// 목록과 탭 숫자는 item-explorer 가 데이터에서 계산해 counts-change 로 알려준다.
@customElement("page-home")
export class PageHome extends LitElement {
  @state() private q = "";
  @state() private tab: TabKey = "all";
  @state() private summary: CatalogSummary | null = null;
  @state() private denied = false;
  @state() private isAdmin = false;
  private unsub: (() => void) | null = null;

  static styles = [
    reduceMotion,
    searchFieldCss,
    sideCardCss,
    css`
      :host {
        display: block;
      }

      /* ===== 홈 2열 — 검색은 왼쪽 위, 보조 패널은 오른쪽 =====
         1024px 미만은 검색 → 필터 → 목록 한 열로 쌓고 보조 패널을 숨긴다.
         등록은 좁은 화면에서 앱 셸의 FAB 가 맡는다. */
      .home-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          "search"
          "main";
        column-gap: var(--space-3);
        row-gap: var(--space-2);
      }
      .home-search {
        grid-area: search;
        max-width: 560px;
      }
      .home-main {
        grid-area: main;
        min-width: 0;
      }
      .home-side {
        grid-area: side;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .controls {
        position: relative;
        width: 100%;
      }

      .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        width: 16px;
        height: 16px;
        color: var(--ink-3);
        pointer-events: none;
        transform: translateY(-50%);
      }

      /* 검색 필드 — 테두리·라운드·글자는 searchFieldCss 가 소유한다 */
      .search {
        flex: 1;
        min-width: 0;
        width: 100%;
        height: 40px;
        padding-left: 40px;
        padding-right: 40px;
      }

      .clear-btn {
        position: absolute;
        right: 4px;
        top: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: var(--radius-pill);
        background: transparent;
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height-button);
        cursor: pointer;
        transform: translateY(-50%);
      }

      .clear-btn:hover {
        background: var(--surface-muted);
        color: var(--ink-1);
      }

      .filters {
        display: flex;
        min-width: 0;
        margin-bottom: var(--space-2);
      }

      x-chip {
        flex: 1;
        min-width: 0;
      }

      .home-side x-button {
        width: 100%;
      }

      .notice {
        display: block;
        margin: 0 0 var(--space-2);
      }

      @media (min-width: 1024px) {
        .home-layout {
          grid-template-columns: minmax(0, 1fr) 320px;
          grid-template-areas:
            "search side"
            "main side";
          align-items: start;
        }
        .home-search {
          max-width: 400px;
        }
        .home-side {
          position: sticky;
          top: 96px;
        }
      }
      @media (max-width: 1023px) {
        .home-side {
          display: none;
        }
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    const p = new URLSearchParams(location.search);
    this.q = p.get("q") ?? ""; // 목록 복귀 시 검색 상태 보존(?q=) — explorer 초기값으로 전달
    if (p.get("role") === "denied") {
      this.denied = true;
      history.replaceState(null, "", "/");
    }
    this.unsub = session.subscribe(() => {
      this.isAdmin = session.isAdmin;
    });
    this.isAdmin = session.isAdmin;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsub?.();
    this.unsub = null;
  }

  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    this.syncSearchUrl();
  }

  private clearSearch() {
    this.q = "";
    this.syncSearchUrl();
  }

  // 검색어를 URL(?q=)에 반영 — 뒤로가기/새로고침/링크 공유 시 검색 상태 복원
  // 입력 중엔 히스토리를 늘리지 않도록 replaceState 사용
  private syncSearchUrl() {
    const p = new URLSearchParams(location.search);
    if (this.q) p.set("q", this.q);
    else p.delete("q");
    const qs = p.toString();
    const target = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (target !== location.pathname + location.search) {
      history.replaceState(null, "", target);
      // 라우터를 거치지 않은 URL 변경 — 스크롤 위치 저장 키도 함께 맞춰 준다
      syncScrollKey();
    }
  }

  private tabCount(key: TabKey): number | undefined {
    if (!this.summary) return undefined;
    if (key === "all") return this.summary.types;
    if (key === "available") return this.summary.available;
    if (key === "rented") return this.summary.rented;
    return this.summary.repair;
  }

  // 부제는 고정 문구 — 물품 종 수는 데이터에 따라 달라지므로 숫자를 넣지 않는다.
  // 현재 종 수는 상태 필터 칩(전체)이 보여준다.
  private get subtitle(): string {
    return "함께 쓰는 물품과 대여 상태를 확인해요.";
  }

  render() {
    return html`
      <div class="page">
        <x-page-header title="물품 현황" subtitle=${this.subtitle}></x-page-header>

        <div class="home-layout">
          <div class="home-search">
            <div class="controls">
              <svg
                class="search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                class="search-input search"
                type="search"
                aria-label="물품 검색"
                placeholder="이름, 위치, 분류 검색"
                .value=${this.q}
                @input=${this.onSearch}
                @keydown=${(e: KeyboardEvent) => {
                  // Esc 로 검색어 비우기 — type="search" 브라우저 기본 동작에 의존하지 않는다
                  if (e.key === "Escape" && this.q) {
                    e.preventDefault();
                    this.clearSearch();
                  }
                }}
              />
              ${this.q
                ? html`
                    <button
                      type="button"
                      class="clear-btn"
                      aria-label="검색어 지우기"
                      title="검색어 지우기"
                      @click=${this.clearSearch}
                    >
                      ✕
                    </button>
                  `
                : ""}
            </div>
          </div>

          <aside class="home-side" aria-label="물품 등록과 대여 안내">
            ${this.isAdmin
              ? html`<x-button
                  variant="primary"
                  @click=${() => navigate("/items/new")}
                >
                  물품 등록
                </x-button>`
              : ""}

            <section class="side-card">
              <h2>대여 안내</h2>
              <p>신청하면 바로 대여 중이 돼요. 반납은 대여 기록에서 할 수 있어요.</p>
              <a href="/my/rentals">내 대여 보기</a>
            </section>
          </aside>

          <div class="home-main">
            <div class="filters">
              <x-chip
                layout="grid"
                ariaLabel="물품 상태 필터"
                .value=${this.tab}
                .options=${TABS.map((t) => ({
                  value: t.key,
                  label: t.label,
                  count: this.tabCount(t.key),
                }))}
                @change=${(e: CustomEvent<{ value: string }>) =>
                  (this.tab = e.detail.value as TabKey)}
              ></x-chip>
            </div>

            ${this.denied
              ? html`
                  <div class="notice">
                    <x-notice tone="danger" alert>
                      관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
                    </x-notice>
                  </div>
                `
              : ""}

            <item-explorer
              .q=${this.q}
              .tab=${this.tab}
              @counts-change=${(e: CustomEvent<CatalogSummary>) =>
                (this.summary = e.detail)}
              @clear-search=${this.clearSearch}
            ></item-explorer>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
