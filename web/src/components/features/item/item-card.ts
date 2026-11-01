import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Item } from "../../../types";
import { statusParts } from "../../../utils/stock";
import { reduceMotion } from "../../../styles/motion";

// 물품 카드 — 사진이 먼저 보이는 카탈로그 카드.
// 사진 → 이름 → 분류·위치 → 상태 순서로 읽고, 상태는 첫 조각만 강조한다.
@customElement("item-card")
export class ItemCard extends LitElement {
  @property({ type: Object }) item!: Item;
  @property() href = "";

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
        height: 100%;
      }

      .card {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: inherit;
        text-decoration: none;
        overflow: hidden;
        box-sizing: border-box;
      }
      .card:hover {
        border-color: var(--border-strong);
      }
      .card:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      /* ===== 사진 ===== */
      .thumb {
        position: relative;
        aspect-ratio: 4 / 3;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-muted);
        color: var(--ink-3);
        overflow: hidden;
      }
      .thumb img {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .fallback {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-1);
      }
      .fallback svg {
        width: 32px;
        height: 32px;
      }
      .fallback-text {
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }

      /* ===== 본문 ===== */
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        flex: 1;
        padding: var(--space-2);
      }
      .name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: var(--text-body);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: var(--line-height);
        color: var(--ink-1);
      }
      .meta {
        font-size: var(--text-fine);
        line-height: var(--line-height);
        color: var(--ink-2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* 모바일 3열에서는 분류를 숨기고 위치만 — "7층 비…" 잘림을 없앤다 */
      @media (max-width: 639px) {
        .cat {
          display: none;
        }
      }
      .status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--text-fine);
        line-height: var(--line-height);
        font-variant-numeric: tabular-nums;
        word-break: keep-all;
      }
      .primary {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        color: var(--ink-1);
        font-weight: 600;
        white-space: nowrap;
      }
      .primary b {
        font-weight: 600;
        color: var(--ink-1);
      }
      .primary.rented,
      .primary.repair,
      .primary.consumable,
      .primary.retired {
        font-weight: 400;
      }
      .primary.rented .rest,
      .primary.repair .rest,
      .primary.consumable .rest,
      .primary.retired .rest {
        color: var(--ink-2);
      }
      .dot {
        flex: none;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ink-3);
      }
      .dot.available {
        background: var(--primary);
      }
      .dot.rented {
        background: var(--ink-3);
      }
      .dot.repair {
        background: var(--warning);
      }
      .rest {
        color: var(--ink-2);
        white-space: nowrap;
      }

      @media (max-width: 639px) {
        .body {
          padding: var(--space-1);
        }
        .name {
          font-size: var(--text-fine);
        }
      }
    `,
  ];

  // "대여 가능 2" → 수량을 먼저 굵게, "수리 중 1" → 라벨 다음에 수량.
  // 시안 카드의 상태 줄과 같은 읽기 순서를 만든다.
  private statusLabel(part: { key: string; label: string }) {
    const m = part.label.match(/^(.*?)\s*(\d+)$/);
    if (!m) return html`<span class="rest">${part.label}</span>`;
    const [, text, count] = m;
    // 대여 중은 수량을 세지 않고 상태만 — 카드의 대여 가능 수량이 우선 정보다
    if (part.key === "rented") return html`<span class="rest">${text}</span>`;
    const countEl = html`<b>${count}개</b>`;
    if (part.key === "available") {
      return html`${countEl}<span class="rest">${text}</span>`;
    }
    return html`<span class="rest">${text}</span>${countEl}`;
  }

  render() {
    const it = this.item;
    if (!it) return html``;

    const cat = (it.categories ?? []).map((c) => c.name).join(", ");
    const loc = it.location ?? "";
    const photo = it.photos?.[0]?.url ?? "";
    const primary = statusParts(it)[0];

    return html`
      <a class="card" href=${this.href}>
        <div class="thumb ${photo ? "" : "empty"}">
          <span class="fallback" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            ${photo ? "" : html`<span class="fallback-text">사진 없음</span>`}
          </span>
          ${photo
            ? html`<img
                src=${photo}
                alt=""
                loading="lazy"
                @error=${(e: Event) => (e.target as HTMLImageElement).remove()}
              />`
            : ""}
        </div>

        <div class="body">
          <span class="name" title=${it.name}>${it.name}</span>
          <span class="meta" title=${[cat, loc].filter(Boolean).join(" · ")}>
            ${cat ? html`<span class="cat">${cat}${loc ? " · " : ""}</span>` : ""}
            <span class="loc">${loc || (cat ? "" : "위치 미지정")}</span>
          </span>
          <span class="status">
            ${primary
              ? html`
                  <span class="primary ${primary.key}">
                    <span class="dot ${primary.key}" aria-hidden="true"></span>
                    ${this.statusLabel(primary)}
                  </span>
                `
              : html`<span class="rest">미지정</span>`}
          </span>
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
