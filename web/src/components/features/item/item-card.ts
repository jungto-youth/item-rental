import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type Item } from "../../../types";
import { navigate } from "../../../router";
import "../../ui/badge";

// DESIGN.md §4.3 — 미니멀 물품 카드
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
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 16px;
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
      justify-content: space-between;
      gap: 8px;
      margin-top: auto;
      padding-top: 4px;
    }

    .qty {
      font-size: var(--text-fine, 12px);
      color: var(--color-muted);
    }
  `;

  private handleClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigate(`/items/${this.item.id}`);
  }

  private handleImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = "none";
  }

  render() {
    if (!this.item) return html``;

    const it = this.item;
    const hasMultiple = it.kind !== "consumable" && (it.rentable_qty ?? 0) > 1;
    const available = Math.max(0, (it.rentable_qty ?? 0) - (it.active_now ?? 0));

    return html`
      <a class="card" href="/items/${it.id}" @click=${this.handleClick}>
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
            ${hasMultiple
              ? html`<span class="qty">${available}/${it.rentable_qty}개 가능</span>`
              : html`<span></span>`}
            ${it.availability_badge
              ? html`<x-badge kind=${it.availability_badge}></x-badge>`
              : ""}
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
