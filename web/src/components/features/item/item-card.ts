import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type Item } from "../../../types";
import { navigate } from "../../../router";
import "../../ui/badge";

// 미니멀 물품 카드
@customElement("item-card")
export class ItemCard extends LitElement {
  @property({ type: Object }) item!: Item;

  static styles = css`
    :host {
      display: block;
    }

    .card {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      background: var(--color-bg);
      text-decoration: none;
      color: inherit;
      overflow: hidden;
      box-sizing: border-box;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .card:hover {
      border-color: var(--color-muted);
      background: var(--color-surface);
    }

    .card.out-of-stock .thumb {
      background: var(--color-surface);
    }
    .card.out-of-stock .thumb img {
      opacity: 0.55;
      filter: grayscale(40%);
    }

    .thumb {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background: var(--color-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-bottom: 1px solid var(--color-border);
      font-size: 2rem;
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.2s ease;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      flex: 1;
    }

    .name {
      font-size: var(--text-body, 15px);
      font-weight: 600;
      line-height: 1.35;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: auto;
      padding-top: 4px;
    }
  `;

  private handleClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    // location.search(?q=)를 이어서 상세 진입 — 뒤로가기 시 목록 검색 상태 유지
    navigate(`/items/${this.item.id}${location.search}`);
  }

  private handleImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = "none";
  }

  render() {
    if (!this.item) return html``;

    const it = this.item;
    const rentable = it.rentable_qty ?? (it.total_qty - (it.qty_broken ?? 0));
    const available = Math.max(0, rentable - (it.active_now ?? 0));
    const isOutOfStock = it.kind !== "consumable" && available === 0;

    let badgeKind = "available";
    let badgeLabel = "대여 가능";

    if (it.kind === "consumable") {
      badgeKind = "neutral";
      badgeLabel = "소모품";
    } else if (it.status !== "active" || (it.qty_broken ?? 0) >= it.total_qty) {
      badgeKind = "repair";
      badgeLabel = "수리중";
    } else if (available === 0) {
      badgeKind = "rented";
      badgeLabel = "대여 중";
    } else if (rentable > 1) {
      badgeKind = "available";
      badgeLabel = `${available}개 가능`;
    }

    return html`
      <a class="card ${isOutOfStock ? "out-of-stock" : ""}" href="/items/${it.id}" @click=${this.handleClick}>
        <div class="thumb">
          ${it.photos && it.photos[0]
            ? html`<img
                src=${it.photos[0].url}
                alt=${it.name}
                loading="lazy"
                @error=${this.handleImgError}
              />`
            : "📦"}
        </div>
        <div class="content">
          <div class="name" title=${it.name}>${it.name}</div>
          <div class="meta">
            <x-badge kind=${badgeKind} label=${badgeLabel}></x-badge>
          </div>
        </div>
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-card": ItemCard;
  }
}
