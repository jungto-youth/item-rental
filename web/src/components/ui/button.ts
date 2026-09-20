import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

@customElement("x-button")
export class XButton extends LitElement {
  @property({ reflect: true }) variant: ButtonVariant = "primary";
  @property({ reflect: true }) size: ButtonSize = "md";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean, reflect: true }) loading = false;
  @property() type: "button" | "submit" = "button";

  static styles = css`
    :host {
      display: inline-block;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      box-sizing: border-box;
      border-radius: var(--radius-md, 8px);
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
      white-space: nowrap;
    }

    /* 크기 스케일 (터치 타깃 44px) */
    .size-md {
      height: 44px;
      padding: 0 16px;
      font-size: var(--text-body, 15px);
    }
    .size-sm {
      height: 36px;
      padding: 0 12px;
      font-size: var(--text-caption, 13px);
    }

    /* Primary: Action Blue 솔리드 풀필 */
    .variant-primary {
      background: var(--color-primary);
      color: var(--color-primary-text, #ffffff);
      border: 1px solid var(--color-primary);
    }
    .variant-primary:hover:not(:disabled) {
      opacity: 0.92;
    }

    /* Secondary: 고스트/아웃라인 */
    .variant-secondary {
      background: transparent;
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }
    .variant-secondary:hover:not(:disabled) {
      background: var(--color-surface);
      border-color: var(--color-muted);
    }

    /* Ghost: 테두리 없는 투명 */
    .variant-ghost {
      background: transparent;
      color: var(--color-muted);
      border: 1px solid transparent;
    }
    .variant-ghost:hover:not(:disabled) {
      background: var(--color-surface);
      color: var(--color-text);
    }

    /* Danger: 파괴적 액션 */
    .variant-danger {
      background: transparent;
      color: var(--color-danger);
      border: 1px solid var(--color-border);
    }
    .variant-danger:hover:not(:disabled) {
      background: var(--tone-danger-bg, #fff1f2);
      border-color: var(--color-danger);
    }

    /* 클릭 시 축소 */
    button:active:not(:disabled) {
      transform: scale(0.97);
    }

    /* 포커스 링 */
    button:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: 2px;
    }

    /* 비활성화 */
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none !important;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  private handleClick(e: MouseEvent) {
    if (this.disabled || this.loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  render() {
    return html`
      <button
        type=${this.type}
        class="variant-${this.variant} size-${this.size}"
        ?disabled=${this.disabled || this.loading}
        @click=${this.handleClick}
      >
        ${this.loading ? html`<span class="spinner"></span>` : ""}
        <slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-button": XButton;
  }
}
