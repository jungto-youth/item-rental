import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate, syncScrollKey } from "../router";
import { session } from "../context/session";
import { reduceMotion } from "../styles/motion";
import { searchFieldCss } from "../styles/ui";
import "../components/ui/button";
import "../components/ui/notice";
import "../components/ui/page-header";
import type { ItemListState } from "../components/features/item/item-explorer";
import "../components/features/item/item-explorer";

// 물품 탐색 — 공개·관리자 통합 목록. 셸은 페이지 제목·검색창·URL 동기화를 소유하고
// 목록 본체(모드 분기·데이터·패널)는 item-explorer가 소유한다.
// explorer 가 카운트를 list-state 로 올려주므로 헤더·목록 카운트가 어긋나지 않는다.
@customElement("page-home")
export class PageHome extends LitElement {
  @state() private q = "";
  @state() private denied = false;
  // explorer 가 올려주는 목록 스냅샷 — 로딩 전에는 undefined 라 카운트를 비워 둔다
  @state() private list?: ItemListState;
  // 목록 카운트와 별개로 관리자 여부는 세션이 유일한 근거다 —
  // explorer 데이터와 무관하게 로그아웃 즉시 액션을 거둔다
  @state() private isAdmin = false;
  private unsub: (() => void) | null = null;

  static styles = [
    reduceMotion,
    searchFieldCss,
    css`
      :host {
        display: block;
      }

      .top-bar {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }

      .search-box {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
      }

      /* .search — searchFieldCss 공용 조형 + 이 화면 전용 오버라이드(클리어 버튼 자리) */
      .search {
        width: 100%;
        padding-right: 44px;
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

      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
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

  // 목록 카운트를 헤더 부제로 — 목록 상단의 별도 카운트 줄을 대체한다.
// 역할·로딩·필터를 모두 고려해 한 문장으로 닫는다.
private subtitle(): string {
    const s = this.list;
    if (!s || s.loading) return "빌릴 물품을 찾아 보세요";
    const isAdmin = this.isAdmin;
    const n = (v: number) => `${v.toLocaleString("ko-KR")}개`;
    if (isAdmin) {
      const filtered = s.visible !== s.total;
      const base = filtered ? `${n(s.total)} 중 ${n(s.visible)}` : n(s.total);
      return s.truncated
        ? `${base} 표시 (1000건까지만 불러왔어요)`
        : `${base} · 대여 중인 물품의 대여자 명단이 함께 보여요`;
    }
    if (this.q) {
      return `'${this.q}' 검색 결과 ${n(s.total)}${
        s.available !== null ? ` · 지금 빌릴 수 있는 것 ${n(s.available)}` : ""
      }`;
    }
    return s.available !== null
      ? `전체 ${n(s.total)} · 지금 빌릴 수 있는 것 ${n(s.available)}`
      : `전체 ${n(s.total)}`;
  }

  private onListState(e: CustomEvent<ItemListState>) {
    this.list = e.detail;
  }

  render() {
    const isAdmin = this.isAdmin;
    return html`
      <x-page-header
        title=${this.q
          ? `'${this.q}' 검색`
          : isAdmin
            ? "물품 관리"
            : "물품 대여"}
        subtitle=${this.subtitle()}
      >
        ${isAdmin
          ? html`<x-button
              slot="action"
              variant="primary"
              size="sm"
              @click=${() => navigate("/items/new")}
            >
              물품 등록
            </x-button>`
          : ""}
      </x-page-header>

      <div class="top-bar">
        <div class="search-box">
          <input
            class="search-input search"
            type="search"
            aria-label="물품 검색"
            placeholder="물품명, 위치, 설명, 카테고리 검색…"
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

      ${this.denied
        ? html`
            <x-notice tone="danger" alert>
              관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
            </x-notice>
          `
        : ""}

      <item-explorer .q=${this.q} @list-state=${this.onListState}></item-explorer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
