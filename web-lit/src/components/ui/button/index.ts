import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonVariantsCss } from "./variants";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

// 버튼 규격 — 높이를 고정하지 않는다.
// 높이는 "내용(글자 줄높이) + 위아래 패딩 + 테두리"로 정해진다.
// 글자 16px · 행간 1.15 · 패딩 8px → 높이 약 36px (18.4 + 16 + 2).
@customElement("x-button")
export class XButton extends LitElement {
  @property({ reflect: true }) variant: ButtonVariant = "primary";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean, reflect: true }) loading = false;
  @property() type: "button" | "submit" = "button";

  static styles = [
    css`
      :host {
        display: inline-block;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1);
        width: 100%;
        box-sizing: border-box;
        /* 위아래 8px · 좌우 16px — 인풋·셀렉트와 동일 */
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius);
        font-family: inherit;
        font-size: var(--text-body);
        font-weight: 600;
        line-height: var(--line-height-button);
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
      }

      /* 포커스 링 */
      button:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      /* 비활성화 */
      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
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
    `,
    buttonVariantsCss,
  ];

  private handleClick(e: MouseEvent) {
    if (this.disabled || this.loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // shadow DOM 내부 버튼은 외부 form과 form-associated 되지 않는다(HTML 스펙 —
    // form owner는 같은 트리 안에서만 결정) — type="submit"이면 host 위치에서 폼을
    // 찾아 네이티브 제출을 대신 수행한다. form 밖(모달 푸터 등)이면 no-op이라
    // 폼을 직접 requestSubmit 하는 기존 우회와도 충돌하지 않는다.
    if (this.type === "submit") this.closest("form")?.requestSubmit();
  }

  render() {
    return html`
      <button
        type=${this.type}
        part="button"
        class="variant-${this.variant}"
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
