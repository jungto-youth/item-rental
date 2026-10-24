import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Item } from "../../../types";
import { handleImgFallback, statusParts } from "../../../utils/stock";

// 물품 목록 행 — .pen '물품 현황' 표 행 / '물품 현황 (M)' 카드의 단일 구현.
// 넓은 화면에서는 4열 표(이름·분류·보관 위치·상태), 좁은 화면에서는 3줄 카드로 접힌다.
// 행 전체가 링크다 — 관리자는 수정 폼, 회원은 상세로 간다 (이슈 #12 §6.2·§6.4).
// 상태 칸은 shared/stock.statusParts 가 만든 조각을 그대로 그린다 (색·구분점만 여기서 소유).
@customElement("item-list-row")
export class ItemListRow extends LitElement {
  @property({ type: Object }) item!: Item;
  @property() href = "";

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 110px 130px 300px;
      grid-template-areas: "thumb body cat loc status";
      align-items: center;
      column-gap: var(--space-4, 16px);
      padding: var(--space-3, 12px) 0;
      border-bottom: 1px solid var(--color-border);
      color: inherit;
      text-decoration: none;
      transition: background-color 0.15s ease;
    }
    .row:hover {
      background: var(--color-surface);
    }
    .row:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: -2px;
    }
    .thumb {
      grid-area: thumb;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-sm, 6px);
      background: var(--color-border);
      color: var(--color-ink-3, #9c9c9c);
      overflow: hidden;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-muted);
    }
    .fallback svg {
      width: 24px;
      height: 24px;
    }
    .body {
      grid-area: body;
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
      min-width: 0;
    }
    .name {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* 모바일 전용 둘째 줄 — 넓은 화면에서는 분류·위치가 각자 열을 쓴다 */
    .meta {
      display: none;
      align-items: center;
      gap: var(--space-1, 4px);
      font-size: var(--text-fine, 12px);
      color: var(--color-ink-3, #9c9c9c);
      min-width: 0;
    }
    .meta > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cat,
    .loc {
      font-size: 1rem;
      color: var(--color-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cat {
      grid-area: cat;
    }
    .loc {
      grid-area: loc;
    }
    .dim {
      color: var(--color-muted);
    }
    /* 상태 — .pen 색: 대여 가능 primary · 대여 중 ink2 · 수리중 ink3 · 구분점 ink3.
       세그먼트는 뒤 구분점을 함께 숨기기 위해 part+sep 을 묶는다 (0 인 대여 가능). */
    .status {
      grid-area: status;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 1rem;
      white-space: nowrap;
    }
    .seg {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .seg.zero {
      display: none;
    }
    .part.available {
      color: var(--color-primary);
      font-weight: 500;
    }
    .part.rented,
    .part.consumable {
      color: var(--color-muted);
    }
    .part.repair,
    .part.retired {
      color: var(--color-ink-3, #9c9c9c);
    }
    .sep {
      color: var(--color-ink-3, #9c9c9c);
    }

    /* 좁은 화면 — 표 열을 카드 3줄로 접는다 (물품 현황 (M)) */
    @media (max-width: 859px) {
      .row {
        grid-template-columns: 48px minmax(0, 1fr);
        grid-template-areas:
          "thumb body"
          "thumb status";
        align-items: start;
        column-gap: var(--space-3, 12px);
        row-gap: var(--space-1, 4px);
      }
      .thumb {
        margin-top: 2px;
      }
      .cat,
      .loc {
        display: none;
      }
      .meta {
        display: flex;
      }
      .status {
        font-size: var(--text-fine, 12px);
        gap: var(--space-1, 4px) 6px;
      }
      /* 모바일 카드는 '대여 가능 0'도 보여준다 (.pen 물품 현황 (M)) */
      .seg.zero {
        display: inline-flex;
      }
      .part.available {
        font-weight: 700;
      }
    }
  `;

  private catText(it: Item): string {
    return (it.categories ?? []).map((c) => c.name).join(", ");
  }

  render() {
    const it = this.item;
    if (!it) return html``;
    const cat = this.catText(it);
    const location = it.location ?? "";
    const parts = statusParts(it);
    const photo = it.photos?.[0]?.url ?? "";
    return html`
      <a class="row" href=${this.href}>
        <div class="thumb">
          ${photo
            ? html`<img src=${photo} alt="" loading="lazy" @error=${handleImgFallback} />`
            : html`<span class="fallback" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </span>`}
        </div>
        <div class="body">
          <span class="name" title=${it.name}>${it.name}</span>
          <span class="meta">
            ${cat ? html`<span>${cat}</span>` : html`<span class="dim">미지정</span>`}
            ${location ? html`<span aria-hidden="true">·</span><span>${location}</span>` : ""}
          </span>
        </div>
        <span class="cat">${cat || html`<span class="dim">미지정</span>`}</span>
        <span class="loc">${location}</span>
        <span class="status">
          ${parts.map(
            (p, i) => html`<span class="seg ${p.zero ? "zero" : ""}">
              <span class="part ${p.key}">${p.label}</span>
              ${i < parts.length - 1
                ? html`<span class="sep" aria-hidden="true">·</span>`
                : ""}
            </span>`,
          )}
        </span>
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-list-row": ItemListRow;
  }
}
