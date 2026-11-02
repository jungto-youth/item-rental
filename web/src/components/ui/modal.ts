import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("x-modal")
export class XModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() title = "";
  @property() maxWidth = "500px";
  @state() private hasFooter = false;

  // 접근성 — 열릴 때 첫 포커스로 이동하고 Tab이 대화상자 안을 돌게 하며,
  // 닫힐 때 열었던 요소로 포커스를 되돌린다. 이름은 title에서 붙인다.
  private readonly titleId = `x-modal-title-${Math.random().toString(36).slice(2)}`;
  private lastFocused: HTMLElement | null = null;

  // 열린 모달 스택 — Esc·Tab은 맨 위 모달만 처리한다. confirmDialog가 페이지 모달 위에
  // 떠 있을 때 두 모달이 같이 닫히고(닫힘 방송이 각자 울리고) 포커스 트랩이 이중으로
  // 계산되는 일을 막는다.
  private static openStack: XModal[] = [];

  private get isTopmost(): boolean {
    return XModal.openStack[XModal.openStack.length - 1] === this;
  }

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
      if (!XModal.openStack.includes(this)) XModal.openStack.push(this);
      this.lastFocused = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        const dialog = this.shadowRoot?.querySelector<HTMLElement>(".dialog");
        (this.focusables[0] ?? dialog)?.focus();
      });
    } else {
      XModal.openStack = XModal.openStack.filter((m) => m !== this);
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
      background: rgba(23, 23, 23, 0.45);
      backdrop-filter: blur(3px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: var(--space-3);
      box-sizing: border-box;
      animation: fadeIn 0.15s ease-out;
    }

    :host([open]) .backdrop {
      display: flex;
    }

    .dialog {
      background: var(--surface);
      color: var(--ink-1);
      border: 0;
      border-radius: var(--radius);
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      box-sizing: border-box;
      box-shadow: var(--shadow-modal);
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0;
    }

    .title {
      font-size: var(--text-heading);
      font-weight: 700;
      margin: 0;
      line-height: 1.3;
    }

    .body {
      padding: 0;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      line-height: var(--line-height);
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-1);
      padding: 0;
    }

    .footer.empty {
      display: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleKeyDown);
    XModal.openStack = XModal.openStack.filter((m) => m !== this);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.open || !this.isTopmost) return;
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

  private onFooterSlotChange(e: Event) {
    const nodes = (e.target as HTMLSlotElement).assignedNodes({ flatten: true });
    this.hasFooter = nodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
    );
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
          tabindex="-1"
          aria-modal="true"
          aria-labelledby=${this.titleId}
        >
          <div class="header">
            <h3 class="title" id=${this.titleId}>${this.title}</h3>
          </div>
          <div class="body">
            <slot></slot>
          </div>
          <div class="footer ${this.hasFooter ? "" : "empty"}">
            <slot name="footer" @slotchange=${this.onFooterSlotChange}></slot>
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
