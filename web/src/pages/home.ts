import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/notice";
import "../components/features/item/item-card";
import "../components/features/item/item-create-dialog";

@customElement("page-home")
export class PageHome extends LitElement {
  @state() private items: Item[] = [];
  @state() private q = "";
  @state() private loading = true;
  @state() private error = "";
  @state() private denied = false;

  @state() private user: SessionUser | null = null;
  @state() private createOpen = false;
  @state() private noticeMsg = "";
  @state() private availableOnly = false;

  private searchTimer = 0;

  static styles = [
    reduceMotion,
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

      .search {
        width: 100%;
        height: 44px;
        padding: 0 36px 0 14px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        color: var(--color-text);
        box-sizing: border-box;
        font-size: var(--text-body, 15px);
        font-family: inherit;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }

      .search:focus {
        outline: none;
        border-color: var(--color-primary);
        background: var(--color-bg);
      }

      .search::placeholder {
        color: var(--color-muted);
      }

      .clear-btn {
        position: absolute;
        right: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 50%;
        background: var(--color-border);
        color: var(--color-muted);
        font-size: 11px;
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .clear-btn:hover {
        background: var(--color-muted);
        color: var(--color-bg);
      }

      .filter-row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
      }

      .filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 32px;
        padding: 0 12px;
        border-radius: var(--radius-pill, 8px);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s ease;
      }

      .filter-chip:hover {
        border-color: var(--color-muted);
        color: var(--color-text);
      }

      .filter-chip.active {
        border-color: var(--color-primary);
        background: var(--color-primary);
        color: var(--color-primary-text);
      }

      .filter-chip .count {
        font-size: var(--text-fine, 12px);
        opacity: 0.85;
      }

      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--space-4, 16px);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    const p = new URLSearchParams(location.search);
    this.q = p.get("q") ?? ""; // 목록 복귀 시 검색 상태 보존(?q=)
    if (p.get("role") === "denied") {
      this.denied = true;
      history.replaceState(null, "", "/");
    }
    await this.fetchItems();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  private async fetchItems() {
    this.loading = true;
    this.error = "";
    try {
      const params = new URLSearchParams();
      if (this.q) params.set("q", this.q);
      const { items } = await api<{ items: Item[] }>(`/api/items?${params}`);
      this.items = items;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "물품 목록을 불러오지 못했습니다";
    } finally {
      this.loading = false;
    }
  }

  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    this.syncSearchUrl();
    clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.fetchItems(), 250);
  }

  private clearSearch() {
    this.q = "";
    this.syncSearchUrl();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.fetchItems();
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
    }
  }

  private isItemAvailable(it: Item): boolean {
    if (it.kind === "consumable") return true;
    if (it.status !== "active") return false;
    const rentable = it.rentable_qty ?? (it.total_qty - (it.qty_broken ?? 0));
    return rentable - (it.active_now ?? 0) > 0;
  }

  private handleItemCreated(e: CustomEvent<{ id: number; failedPhotos: string[] }>) {
    this.createOpen = false;
    this.fetchItems();
    if (e.detail.failedPhotos.length > 0) {
      this.noticeMsg = `저장 완료 (사진 업로드 실패: ${e.detail.failedPhotos.join(", ")})`;
    } else {
      navigate(`/items/${e.detail.id}`);
    }
  }

  render() {
    const availableCount = this.items.filter((it) => this.isItemAvailable(it)).length;
    const visibleItems = this.availableOnly
      ? this.items.filter((it) => this.isItemAvailable(it))
      : this.items;

    return html`
      <div class="top-bar">
        <div class="search-box">
          <input
            class="search"
            aria-label="물품 검색"
            placeholder="물품명, 위치, 설명, 카테고리 검색…"
            .value=${this.q}
            @input=${this.onSearch}
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
          ? html`
              <x-button variant="primary" size="md" @click=${() => (this.createOpen = true)}>
                + 물품 등록
              </x-button>
            `
          : ""}
      </div>

      <div class="filter-row">
        <button
          type="button"
          class="filter-chip ${!this.availableOnly ? "active" : ""}"
          aria-pressed=${!this.availableOnly}
          @click=${() => (this.availableOnly = false)}
        >
          전체 <span class="count">${this.items.length}</span>
        </button>
        <button
          type="button"
          class="filter-chip ${this.availableOnly ? "active" : ""}"
          aria-pressed=${this.availableOnly}
          @click=${() => (this.availableOnly = true)}
        >
          대여 가능만 <span class="count">${availableCount}</span>
        </button>
      </div>

      ${this.noticeMsg ? html`<x-notice>${this.noticeMsg}</x-notice>` : ""}
      ${this.denied
        ? html`
            <x-notice tone="danger" alert>
              관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
            </x-notice>
          `
        : ""}

      ${this.error
        ? html`<x-empty state="error" text=${this.error}></x-empty>`
        : this.loading
          ? html`<x-empty state="loading"></x-empty>`
          : visibleItems.length === 0
            ? html`<x-empty state="empty" text=${this.availableOnly ? "대여 가능한 물품이 없어요" : "검색 결과가 없어요"}></x-empty>`
            : html`
                <div class="grid">
                  ${visibleItems.map((it) => html`<item-card .item=${it}></item-card>`)}
                </div>
              `}

      <item-create-dialog
        ?open=${this.createOpen}
        @close=${() => (this.createOpen = false)}
        @created=${this.handleItemCreated}
      ></item-create-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
