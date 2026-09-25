import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import { navigate } from "../router";
import "../components/ui/badge";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/features/item/item-gallery";
import "../components/features/item/item-rental-form";
import "../components/features/item/item-edit-dialog";

@customElement("page-item-detail")
export class PageItemDetail extends LitElement {
  @property() itemId = "";

  @state() private item: Item | null = null;
  @state() private loading = true;
  @state() private error = "";

  // 로드 세대 — itemId가 빠르게 바뀌면(A→B 전환) 늦게 도착한 A의 응답이 B를 덮어쓰지 않게 한다
  private loadGen = 0;

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
        justify-content: flex-end; /* 액션은 오른쪽에 모은다 — 다이얼로그 푸터(취소→확인)와 동일 순서 */
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
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

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .tag {
        font-size: var(--text-caption, 13px);
        color: var(--color-text);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 2px 10px;
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

      .mobile-cta-bar {
        display: none;
      }

      @media (max-width: 767px) {
        :host {
          padding-bottom: 72px;
        }

        .mobile-cta-bar {
          display: flex;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--color-bg);
          border-top: 1px solid var(--color-border);
          padding: 10px var(--space-4, 16px);
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          z-index: 20;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
        }

        .mobile-cta-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .mobile-cta-name {
          font-size: var(--text-caption, 13px);
          font-weight: 600;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mobile-cta-status {
          font-size: var(--text-fine, 12px);
          color: var(--color-muted);
        }

        .mobile-cta-btn {
          flex-shrink: 0;
        }
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
    const gen = ++this.loadGen;
    if (!quiet) this.loading = true;
    try {
      const res = await api<{ item: Item }>(`/api/items/${this.itemId}`);
      if (gen !== this.loadGen) return; // 다른 물품 로드가 시작됨 — 늦은 응답은 버린다
      this.item = res.item;
      this.error = "";
    } catch (e) {
      if (gen !== this.loadGen) return;
      if (!quiet) this.error = e instanceof Error ? e.message : "물품 정보를 불러오지 못했어요";
    } finally {
      if (gen === this.loadGen && !quiet) this.loading = false;
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

  // 정보 행 — 재고/구분/위치를 하나의 dl 그리드로 통일
  private attrPairs(): [string, string][] {
    const it = this.item;
    if (!it) return [];
    const pairs: [string, string][] = [];
    if (it.kind === "consumable") {
      pairs.push(["보유 수량", `${it.total_qty}개`]);
      pairs.push(["구분", "소모품"]);
    } else {
      pairs.push(["대여 가능", `${this.availableNow}개`]);
      pairs.push(["전체 보유", `${it.total_qty}개`]);
      if ((it.qty_broken ?? 0) > 0) pairs.push(["수리중", `${it.qty_broken}개`]);
    }
    if (it.location) pairs.push(["보관 위치", it.location]);
    return pairs;
  }

  render() {
    if (this.error) {
      return html`
        <div class="top-nav">
          <x-button variant="secondary" size="sm" @click=${() => history.back()}>취소</x-button>
        </div>
        <x-empty state="error" text=${this.error}></x-empty>
      `;
    }

    if (this.loading || !this.item) {
      return html`
        <div class="top-nav">
          <x-button variant="secondary" size="sm" @click=${() => history.back()}>취소</x-button>
        </div>
        <x-empty state="loading"></x-empty>
      `;
    }

    const it = this.item;
    const attrs = this.attrPairs();

    return html`
      <div class="top-nav">
        <x-button variant="secondary" size="sm" @click=${() => history.back()}>취소</x-button>
        ${this.isAdmin
          ? html`
              <x-button variant="primary" size="sm" @click=${() => (this.editOpen = true)}>
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
            ${it.categories?.length
              ? html`
                  <div class="tags">
                    ${it.categories.map(
                      (c) => html`<span class="tag">#${c.name}</span>`,
                    )}
                  </div>
                `
              : ""}
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

      ${it.kind !== "consumable" && this.availableNow > 0
        ? html`
            <div class="mobile-cta-bar">
              <div class="mobile-cta-text">
                <span class="mobile-cta-name">${it.name}</span>
                <span class="mobile-cta-status">${this.availableNow}개 대여 가능</span>
              </div>
              <div class="mobile-cta-btn">
                <x-button
                  variant="primary"
                  size="md"
                  @click=${() => {
                    this.renderRoot
                      .querySelector("item-rental-form")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  대여하기
                </x-button>
              </div>
            </div>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-item-detail": PageItemDetail;
  }
}
