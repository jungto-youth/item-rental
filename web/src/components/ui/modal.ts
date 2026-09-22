import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./icon-btn";

@customElement("x-modal")
export class XModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() title = "";
  @property() maxWidth = "500px";

  // 접근성 — 열릴 때 첫 포커스로 이동하고 Tab이 대화상자 안을 돌게 하며,
  // 닫힐 때 열었던 요소로 포커스를 되돌린다. 이름은 title에서 붙인다.
  @state() private titleId = `x-modal-title-${Math.random().toString(36).slice(2)}`;
  private lastFocused: HTMLElement | null = null;

  private get focusables(): HTMLElement[] {
    const sel =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    // 슬롯된 본문은 라이트 DOM, 닫기 버튼은 섀도 DOM — 둘 다 모은다
    const light = Array.from(this.querySelectorAll<HTMLElement>(sel));
    const shadow = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLElement>(sel) ?? [],
    );
    return [...light, ...shadow];
  }

  private handleOpenChange() {
    if (this.open) {
      this.lastFocused = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        const dialog = this.shadowRoot?.querySelector<HTMLElement>(".dialog");
        (this.focusables[0] ?? dialog)?.focus();
      });
    } else {
      // 외부에서 open을 내린 경우에도 트리거로 포커스를 돌려준다
      this.lastFocused?.focus();
      this.lastFocused = null;
    }
  }

  private handleTab(e: KeyboardEvent) {
    const items = this.focusables;
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = this.shadowRoot?.activeElement ?? document.activeElement;
    if (e.shiftKey && (current === first || current === this)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  }

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
    if (!this.open) return;
    if (e.key === "Escape") {
      this.close();
    } else if (e.key === "Tab") {
      this.handleTab(e);
    }
  };

  protected updated(changed: Map<string | number | symbol, unknown>) {
    super.updated(changed);
    if (changed.has("open")) this.handleOpenChange();
  }

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
        <div
          class="dialog"
          style="max-width: ${this.maxWidth}"
          role="dialog"
          aria-modal="true"
          aria-labelledby=${this.titleId}
        >
          <div class="header">
            <h3 class="title" id=${this.titleId}>${this.title}</h3>
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
