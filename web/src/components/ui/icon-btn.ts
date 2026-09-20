import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 아이콘만 있는 작은 버튼 — 테마 전환, 모달 닫기 등 32px 터치 타깃 통일.
@customElement("x-icon-btn")
export class XIconBtn extends LitElement {
  @property() label = "";

  static styles = css`
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: var(--color-muted);
      cursor: pointer;
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    button:hover {
      color: var(--color-text);
      background: var(--color-surface);
    }
    button:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: 2px;
    }
    ::slotted(svg) {
      width: 16px;
      height: 16px;
      display: block;
    }
  `;

  render() {
    return html`
      <button type="button" aria-label=${this.label} title=${this.label}>
        <slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-icon-btn": XIconBtn;
  }
}