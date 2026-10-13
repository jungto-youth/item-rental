import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type Item } from "../../../types";
import { navigate } from "../../../router";
import { availableQty, badgeFor, handleImgFallback, rentableQty } from "../../../utils/stock";
import "../../ui/badge";

// 미니멀 물품 카드 — 발견(찾기) 전용. 수정 진입은 통합 목록의 관리자 행에서.
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
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-3-5, 14px);
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

    /* 보관 위치 — 대여 전에 "어디서 챙길지"를 알 수 있는 유일한 힌트 */
    .loc {
      font-size: var(--text-caption, 13px);
      line-height: 1.4;
      color: var(--color-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2, 8px);
      margin-top: auto;
      padding-top: var(--space-1, 4px);
    }

    /* 대여품만 수량을 보여준다 — 소모품은 빌리는 게 아니고 배지로도 충분하다 */
    .qty {
      flex-shrink: 0;
      font-size: var(--text-caption, 13px);
      line-height: 1.4;
      color: var(--color-muted);
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

  // 깨진 이미지는 공용 폴백(utils/stock)으로 — 빈 상자 대신 물품 아이콘
  private handleImgError = handleImgFallback;

  render() {
    if (!this.item) return html``;

    const it = this.item;
    const { kind: badgeKind, label: badgeLabel } = badgeFor(it);
    const isOutOfStock = it.kind !== "consumable" && badgeKind !== "available";

    return html`
      <a class="card ${isOutOfStock ? "out-of-stock" : ""}" href="/items/${it.id}" @click=${this.handleClick}>
        <div class="thumb">
          ${it.photos && it.photos[0]
            ? html`<img
                src=${it.photos[0].url}
                alt=""
                loading="lazy"
                @error=${this.handleImgError}
              />`
            : html`<span aria-hidden="true">📦</span>`}
        </div>
        <div class="content">
          <div class="name" title=${it.name}>${it.name}</div>
          ${it.location ? html`<div class="loc" title=${it.location}>${it.location}</div>` : ""}
          <div class="meta">
            <x-badge kind=${badgeKind} label=${badgeLabel}></x-badge>
            ${it.kind === "consumable"
              ? ""
              : html`<span class="qty"
                  >${availableQty(it)}/${rentableQty(it)}</span
                >`}
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
