import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate, syncScrollKey } from "../router";
import { session } from "../context/session";
import { reduceMotion } from "../styles/motion";
import { searchFieldCss } from "../styles/ui";
import "../components/ui/button";
import "../components/ui/page-header";
import "../components/ui/notice";
import "../components/features/item/item-explorer";

// 물품 현황 — 페이지 제목·검색·등록 액션을 소유한다.
// 필터 칩과 목록은 item-explorer 가 그린다.
@customElement("page-home")
export class PageHome extends LitElement {
  @state() private q = "";
  @state() private denied = false;
  @state() private isAdmin = false;
  private unsub: (() => void) | null = null;

  static styles = [
    reduceMotion,
    searchFieldCss,
    css`
      :host {
        display: block;
      }

      /* 제목은 x-page-header, 검색·등록 액션은 그 아래 툴바가 소유한다 */
      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        margin-bottom: var(--space-2);
      }

      .controls {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        width: min(100%, 560px);
      }

      .search-box {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        flex: 1;
        min-width: 0;
        width: 100%;
      }

      /* 검색 필드 — 테두리·라운드·글자는 searchFieldCss 가 소유한다 */
      .search {
        flex: 1;
        min-width: 0;
        width: auto;
      }

      .clear-btn {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: var(--space-4);
        height: var(--space-4);
        padding: 0;
        border: none;
        border-radius: var(--radius-pill);
        background: var(--surface-muted);
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height-button);
        cursor: pointer;
      }

      .clear-btn:hover {
        background: var(--border);
        color: var(--ink-1);
      }

      .notice {
        display: block;
        margin: 0 0 var(--space-2);
      }

      /* 좁은 화면 — 제목 → 검색 → 칩 → 목록. 등록은 하단 FAB 가 맡는다. */
      @media (max-width: 859px) {
        .controls {
          width: 100%;
        }
        x-button.add {
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

  render() {
    return html`
      <div class="page">
        <x-page-header title="물품 현황"></x-page-header>

        <div class="toolbar">
          <div class="controls">
            <div class="search-box">
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

            ${this.isAdmin
              ? html`<x-button
                  class="add"
                  variant="primary"
                  @click=${() => navigate("/items/new")}
                >
                  물품 등록
                </x-button>`
              : ""}
          </div>
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

        <item-explorer .q=${this.q} @clear-search=${this.clearSearch}></item-explorer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
