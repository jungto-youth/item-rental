import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate, syncScrollKey } from "../router";
import { session } from "../context/session";
import { reduceMotion } from "../styles/motion";
import { searchFieldCss } from "../styles/ui";
import type { CatalogSummary } from "../types";
import "../components/ui/button";
import "../components/ui/notice";
import "../components/features/item/item-explorer";

// 물품 현황 — .pen 의 Page Header(제목·검색·등록)와 Summary 를 소유한다.
// 요약을 여기서 그리는 이유: 모바일은 [제목 → 요약 → 검색 → 탭] 순서인데
// 데스크탑은 [제목+검색] 한 줄 → 요약 순서라, 검색 입력을 화면 폭에 따라
// grid 로 옮겨야 한다. 검색을 하나만 두기 위해 요약 데이터만 explorer 가 올려준다.
@customElement("page-home")
export class PageHome extends LitElement {
  @state() private q = "";
  @state() private denied = false;
  @state() private isAdmin = false;
  @state() private summary: CatalogSummary = { types: 0, available: 0, rented: 0, repair: 0 };
  private unsub: (() => void) | null = null;

  static styles = [
    reduceMotion,
    searchFieldCss,
    css`
      :host {
        display: block;
      }

      /* ===== 레이아웃 — 데스크탑: [제목 | 검색 | 등록] / 요약 / 목록 ===== */
      .page {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px auto;
        grid-template-areas:
          "title search add"
          "summary summary summary"
          "notice notice notice"
          "list list list";
        align-items: center;
        column-gap: var(--space-2, 8px);
      }
      .title {
        grid-area: title;
      }
      .search-box {
        grid-area: search;
      }
      x-button.add {
        grid-area: add;
      }
      .summary {
        grid-area: summary;
      }
      .notice {
        grid-area: notice;
      }
      item-explorer {
        grid-area: list;
      }

      h1 {
        margin: 0;
        padding: var(--space-3, 12px) 0;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        line-height: 1.2;
        color: var(--color-text);
      }

      .search-box {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        padding: var(--space-3, 12px) 0;
        box-sizing: border-box;
      }

      /* .pen Input — 흰 배경 · 1px line · radius 6 · 16px · 좌우 24px */
      .search {
        width: 100%;
        height: 44px;
        padding: 0 44px 0 var(--space-5, 24px);
        border-radius: var(--radius-sm, 6px);
        background: var(--color-bg);
        font-size: 1rem;
      }
      .search::placeholder {
        color: var(--color-ink-3, #9c9c9c);
      }

      .clear-btn {
        position: absolute;
        right: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: var(--color-border);
        color: var(--color-muted);
        font-size: var(--text-fine, 12px);
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .clear-btn:hover {
        background: var(--color-muted);
        color: var(--color-bg);
      }

      /* 등록 버튼 — .pen Button Primary (radius 6 · 48px · 16/700) */
      x-button.add {
        --x-button-height: 48px;
        --x-button-radius: var(--radius-sm, 6px);
        --x-button-padding: 0 var(--space-5, 24px);
        --x-button-font-size: 1rem;
        --x-button-weight: 700;
      }

      /* ===== 요약 ===== */
      .summary {
        display: flex;
        align-items: flex-start;
        gap: var(--space-5, 24px);
        padding: var(--space-3, 12px) 0;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-1, 4px);
      }
      .value {
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: var(--tracking-tight);
        color: var(--color-text);
      }
      .value.primary {
        color: var(--color-primary);
      }
      .label {
        font-size: 1rem;
        color: var(--color-ink-3, #9c9c9c);
        white-space: nowrap;
      }

      .notice {
        display: block;
      }
      .notice:empty {
        display: none;
      }
      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }

      /* ===== 좁은 화면 — 물품 현황 (M): 제목 → 요약 → 검색 → 목록 ===== */
      @media (max-width: 859px) {
        .page {
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas:
            "title"
            "summary"
            "search"
            "notice"
            "list";
        }
        /* 등록은 하단 FAB 가 맡는다 (.pen 물품 현황 (M)) */
        x-button.add {
          display: none;
        }
        h1 {
          font-size: 1.5rem;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-2, 8px);
        }
        .search {
          padding-left: var(--space-4, 16px);
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

  // explorer 가 올려주는 요약 — 목록 데이터의 주인은 explorer 다
  private onSummary(e: CustomEvent<CatalogSummary>) {
    this.summary = e.detail;
  }

  private stats(): { label: string; value: number; tone?: string }[] {
    const s = this.summary;
    // 모두 종류 수 — 수량은 각 행의 상태 칸이 보여준다 (2026-10-24 개정)
    return [
      { label: "전체", value: s.types },
      { label: "대여 가능", value: s.available },
      { label: "대여 중", value: s.rented, tone: "primary" },
      { label: "수리 중", value: s.repair },
    ];
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

  render() {
    return html`
      <div class="page">
        <h1 class="title">물품 현황</h1>

        <div class="search-box">
          <input
            class="search-input search"
            type="search"
            aria-label="물품 검색"
            placeholder="물품 검색"
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

        ${this.isAdmin
          ? html`<x-button
              class="add"
              variant="primary"
              size="md"
              @click=${() => navigate("/items/new")}
            >
              물품 등록
            </x-button>`
          : ""}

        <section class="summary" aria-label="물품 요약">
          ${this.stats().map(
            (s) => html`
              <div class="stat">
                <span class="value ${s.tone ?? ""}">${s.value.toLocaleString("ko-KR")}</span>
                <span class="label">${s.label}</span>
              </div>
            `,
          )}
        </section>

        <div class="notice">
          ${this.denied
            ? html`
                <x-notice tone="danger" alert>
                  관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
                </x-notice>
              `
            : ""}
        </div>

        <item-explorer .q=${this.q} @summary-change=${this.onSummary}></item-explorer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
