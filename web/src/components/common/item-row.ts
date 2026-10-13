import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { navigate } from "../../router";
import { cardCss } from "../../styles/ui";
import { handleImgFallback } from "../../utils/stock";
import "../ui/badge";
import "../ui/button";

// 물품 1건 행 — 통합 탐색(관리자 모드) 공용.
// 썸네일 + 이름(링크) + 메타 슬롯 + 배지(선택) + 수정 버튼(선택) +
// 펼치기(선택, 대여자 패널 같은 상세 슬롯).
// 깨진 이미지 폴백·행 조형을 한 곳에 모아 행 복사를 없앤다.
@customElement("item-row")
export class ItemRow extends LitElement {
  @property() photo = "";
  @property() name = "";
  // 이름 링크 — 비우면 링크가 아니다
  @property() href = "";
  @property() badgeKind = "";
  @property() badgeLabel = "";
  // 비우면 수정 버튼이 없다
  @property() editHref = "";
  // 펼치기 — true면 행 우측에 chevron, 펼치면 detail 슬롯을 아래에 그린다
  @property({ type: Boolean }) expandable = false;
  @property({ type: Boolean }) expanded = false;

  static styles = [
    cardCss,
    css`
      :host {
        display: block;
      }
      .card {
        margin-bottom: var(--space-2, 8px);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }
      .thumb {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        font-size: 18px;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .info {
        flex: 1;
        min-width: 0;
      }
      .name {
        font-weight: 600;
        font-size: var(--text-body, 15px);
        letter-spacing: var(--tracking-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      a.name {
        color: var(--color-text);
        text-decoration: none;
      }
      a.name:hover {
        color: var(--color-primary);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1, 4px) var(--space-2, 8px);
        margin-top: var(--space-1, 4px);
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
      }
      .meta:empty {
        display: none;
      }
      ::slotted(.hl) {
        color: var(--color-primary);
        font-weight: 600;
      }
      ::slotted(.dim) {
        color: var(--color-muted);
        font-weight: 400;
      }
      x-button {
        flex-shrink: 0;
      }
      .expander {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: transparent;
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
        cursor: pointer;
        font-family: inherit;
      }
      .expander:hover {
        color: var(--color-text);
        border-color: var(--color-muted);
      }
      .detail {
        margin-top: var(--space-2, 8px);
        padding-top: var(--space-2, 8px);
        border-top: 1px solid var(--color-border);
        display: grid;
        gap: var(--space-1, 4px);
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .detail:empty {
        display: none;
      }
    `,
  ];

  private goEdit() {
    if (this.editHref) navigate(this.editHref);
  }

  private toggle() {
    this.dispatchEvent(new CustomEvent("toggle", { bubbles: true, composed: true }));
  }

  render() {
    const title = this.href
      ? html`<a class="name" href=${this.href}>${this.name}</a>`
      : html`<span class="name">${this.name}</span>`;
    return html`
      <div class="card">
        <div class="row">
          <div class="thumb">
            ${this.photo
              ? html`<img
                  src=${this.photo}
                  alt=""
                  loading="lazy"
                  @error=${handleImgFallback}
                />`
              : html`<span aria-hidden="true">📦</span>`}
          </div>
          <div class="info">
            ${title}
            <div class="meta"><slot></slot></div>
          </div>
          ${this.badgeKind
            ? html`<x-badge kind=${this.badgeKind} label=${this.badgeLabel || undefined}></x-badge>`
            : ""}
          ${this.editHref
            ? html`<x-button variant="secondary" size="sm" @click=${this.goEdit}>
                수정
              </x-button>`
            : ""}
          ${this.expandable
            ? html`<button
                type="button"
                class="expander"
                aria-expanded=${this.expanded}
                aria-label=${this.expanded ? "대여자 접기" : "대여자 보기"}
                title=${this.expanded ? "대여자 접기" : "대여자 보기"}
                @click=${this.toggle}
              >
                ${this.expanded ? "▲" : "▼"}
              </button>`
            : ""}
        </div>
        ${this.expanded ? html`<div class="detail"><slot name="detail"></slot></div>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-row": ItemRow;
  }
}
