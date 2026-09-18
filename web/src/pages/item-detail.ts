import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import { navigate } from "../router";
import "../components/ui/badge";
import "../components/ui/button";
import "../components/features/item/item-gallery";
import "../components/features/item/item-rental-form";
import "../components/features/item/item-edit-dialog";

@customElement("page-item-detail")
export class PageItemDetail extends LitElement {
  @property() itemId = "";

  @state() private item: Item | null = null;
  @state() private loading = true;
  @state() private error = "";

  @state() private user: SessionUser | null = null;
  @state() private userReady = false;
  @state() private editOpen = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }

      .top-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-4, 16px);
      }

      .back-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--color-muted);
        text-decoration: none;
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        cursor: pointer;
        background: none;
        border: none;
        padding: 6px 0;
      }

      .back-btn:hover {
        color: var(--color-text);
      }

      .content-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-5, 24px);
      }

      @media (min-width: 768px) {
        .content-grid {
          grid-template-columns: 1.1fr 1fr;
          align-items: start;
        }
      }

      .info-col {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      .header-area {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      h1 {
        font-size: var(--text-title, 20px);
        font-weight: 600;
        margin: 0;
        line-height: 1.3;
        color: var(--color-text);
      }

      .desc {
        font-size: var(--text-body, 15px);
        line-height: 1.6;
        color: var(--color-muted);
        margin: 0;
        white-space: pre-wrap;
      }

      .specs {
        display: flex;
        gap: 16px;
        padding: 12px 16px;
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        font-size: var(--text-caption, 13px);
      }

      .spec-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .spec-label {
        color: var(--color-muted);
        font-size: var(--text-fine, 12px);
      }

      .spec-val {
        font-weight: 600;
        color: var(--color-text);
      }

      .attrs {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 10px 12px;
        margin: 0;
        font-size: var(--text-caption, 13px);
        line-height: 1.5;
      }

      dt {
        color: var(--color-muted);
        font-weight: 500;
      }

      dd {
        margin: 0;
        color: var(--color-text);
      }

      .error-box {
        text-align: center;
        padding: 48px 16px;
        color: var(--color-danger);
      }

      .loading-box {
        text-align: center;
        padding: 48px 16px;
        color: var(--color-muted);
      }
    `,
  ];

  protected updated(changed: PropertyValues) {
    if (changed.has("itemId") && this.itemId) {
      void this.load();
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.userReady = true;
  }

  private async load(quiet = false) {
    if (!quiet) this.loading = true;
    try {
      const res = await api<{ item: Item }>(`/api/items/${this.itemId}`);
      this.item = res.item;
      this.error = "";
    } catch (e) {
      if (!quiet) this.error = e instanceof Error ? e.message : "물품 정보를 불러오지 못했습니다";
    } finally {
      if (!quiet) this.loading = false;
    }
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  private get rentableQty(): number {
    if (!this.item) return 0;
    return this.item.rentable_qty ?? (this.item.total_qty - (this.item.qty_broken ?? 0));
  }

  private get availableNow(): number {
    return Math.max(0, this.rentableQty - (this.item?.active_now ?? 0));
  }

  private attrPairs(): [string, string][] {
    const it = this.item;
    if (!it) return [];
    const pairs: [string, string][] = [];
    if (it.kind === "consumable") pairs.push(["구분", "소모품"]);
    if (it.location) pairs.push(["보관 위치", it.location]);
    if (it.size) pairs.push(["규격", it.size]);
    if (it.color) pairs.push(["색상", it.color]);
    if (it.note) pairs.push(["비고", it.note]);
    return pairs;
  }

  render() {
    if (this.error) {
      return html`
        <div class="top-nav">
          <button class="back-btn" @click=${() => history.back()}>← 목록으로</button>
        </div>
        <div class="error-box">${this.error}</div>
      `;
    }

    if (this.loading || !this.item) {
      return html`
        <div class="top-nav">
          <button class="back-btn" @click=${() => history.back()}>← 목록으로</button>
        </div>
        <div class="loading-box">불러오는 중…</div>
      `;
    }

    const it = this.item;
    const attrs = this.attrPairs();

    return html`
      <div class="top-nav">
        <button class="back-btn" @click=${() => history.back()}>← 목록으로</button>
        ${this.isAdmin
          ? html`
              <x-button variant="secondary" size="sm" @click=${() => (this.editOpen = true)}>
                수정
              </x-button>
            `
          : ""}
      </div>

      <div class="content-grid">
        <div class="gallery-col">
          <item-gallery .photos=${it.photos} .name=${it.name}></item-gallery>
        </div>

        <div class="info-col">
          <div class="header-area">
            <div class="title-row">
              <h1>${it.name}</h1>
              ${it.availability_badge
                ? html`<x-badge kind=${it.availability_badge}></x-badge>`
                : ""}
            </div>
            ${it.description ? html`<p class="desc">${it.description}</p>` : ""}
          </div>

          <div class="specs">
            ${it.kind !== "consumable"
              ? html`
                  <div class="spec-item">
                    <span class="spec-label">대여 가능</span>
                    <span class="spec-val">${this.availableNow}개</span>
                  </div>
                `
              : ""}
            ${(it.qty_broken ?? 0) > 0
              ? html`
                  <div class="spec-item">
                    <span class="spec-label">수리중</span>
                    <span class="spec-val">${it.qty_broken}개</span>
                  </div>
                `
              : ""}
            <div class="spec-item">
              <span class="spec-label">전체 보유</span>
              <span class="spec-val">${it.total_qty}개</span>
            </div>
          </div>

          ${attrs.length > 0
            ? html`
                <dl class="attrs">
                  ${attrs.map(
                    ([k, v]) => html`
                      <dt>${k}</dt>
                      <dd>${v}</dd>
                    `,
                  )}
                </dl>
              `
            : ""}

          <item-rental-form
            .item=${it}
            .user=${this.user}
            .userReady=${this.userReady}
            @rented=${() => void this.load(true)}
          ></item-rental-form>
        </div>
      </div>

      <item-edit-dialog
        ?open=${this.editOpen}
        .item=${it}
        @close=${() => (this.editOpen = false)}
        @saved=${() => void this.load(true)}
        @photo-changed=${() => void this.load(true)}
        @deleted=${() => navigate("/")}
      ></item-edit-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-item-detail": PageItemDetail;
  }
}
