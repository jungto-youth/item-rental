import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 아이콘만 있는 작은 버튼 — 모달 닫기 등 32px 터치 타깃 통일.
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
      min-width: 38px;
      min-height: 38px;
      padding: var(--space-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink-2);
      cursor: pointer;
      line-height: var(--line-height-button);
    }
    button:hover {
      border-color: var(--border-strong);
      background: var(--surface-muted);
      color: var(--ink-1);
    }
    button:focus-visible {
      outline: 2px solid var(--primary);
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
      <button
        type="button"
        part="button"
        aria-label=${this.label}
        title=${this.label}
      >
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