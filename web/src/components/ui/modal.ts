import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./icon-btn";

@customElement("x-modal")
export class XModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() title = "";
  @property() maxWidth = "500px";

  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      backdrop-filter: blur(2px);
      animation: fadeIn 0.15s ease-out;
    }

    :host([open]) .backdrop {
      display: flex;
    }

    .dialog {
      background: var(--color-bg);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--color-border);
    }

    .title {
      font-size: var(--text-heading, 17px);
      font-weight: 600;
      margin: 0;
      line-height: 1.3;
    }

    .body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    /* 슬롯이 비었을 때 footer 감춤 */
    .footer:empty {
      display: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      this.close();
    }
  };

  private handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.close();
    }
  }

  close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  render() {
    if (!this.open) return html``;

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}>
        <div class="dialog" style="max-width: ${this.maxWidth}" role="dialog" aria-modal="true">
          <div class="header">
            <h3 class="title">${this.title}</h3>
            <x-icon-btn label="닫기" @click=${this.close}>×</x-icon-btn>
          </div>
          <div class="body">
            <slot></slot>
          </div>
          <div class="footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-modal": XModal;
  }
}
