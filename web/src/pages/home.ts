import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import "../components/ui/button";
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

      .search-icon {
        position: absolute;
        left: 14px;
        color: var(--color-muted);
        pointer-events: none;
        font-size: 14px;
      }

      .search {
        width: 100%;
        height: 44px;
        padding: 0 16px 0 38px;
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

      .notice {
        padding: 10px 14px;
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        font-size: var(--text-caption, 13px);
        color: var(--color-text);
        margin-bottom: var(--space-4, 16px);
      }

      .notice.alert {
        border-color: var(--color-danger);
        color: var(--color-danger);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--space-4, 16px);
      }

      .empty {
        text-align: center;
        padding: 48px 16px;
        color: var(--color-muted);
        font-size: var(--text-body, 15px);
      }

      .error {
        color: var(--color-danger);
        text-align: center;
        padding: 32px 16px;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    const p = new URLSearchParams(location.search);
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
    clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.fetchItems(), 250);
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
    return html`
      <div class="top-bar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            class="search"
            placeholder="물품명, 위치, 설명 검색…"
            .value=${this.q}
            @input=${this.onSearch}
          />
        </div>
        ${this.isAdmin
          ? html`
              <x-button variant="primary" size="md" @click=${() => (this.createOpen = true)}>
                + 물품 등록
              </x-button>
            `
          : ""}
      </div>

      ${this.noticeMsg ? html`<div class="notice">${this.noticeMsg}</div>` : ""}
      ${this.denied
        ? html`
            <div class="notice alert" role="alert">
              관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
            </div>
          `
        : ""}

      ${this.error
        ? html`<p class="error">${this.error}</p>`
        : this.loading
          ? html`<p class="empty">물품 목록을 불러오는 중…</p>`
          : this.items.length === 0
            ? html`<p class="empty">검색 결과가 없어요</p>`
            : html`
                <div class="grid">
                  ${this.items.map((it) => html`<item-card .item=${it}></item-card>`)}
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
