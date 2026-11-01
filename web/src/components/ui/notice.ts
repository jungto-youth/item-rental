import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// 인라인 안내 배너 — info / danger 2톤. 경고성 안내도 danger 색을 쓴다.
// 오른쪽에 액션 버튼을 넣고 싶으면 슬롯 안에 x-button 등을 배치한다.
@customElement("x-notice")
export class XNotice extends LitElement {
  @property() tone: "info" | "danger" = "info";
  @property({ type: Boolean, reflect: true }) alert = false;
  // 액션 슬롯이 비면 오른쪽 빈 상자와 gap 을 만들지 않는다
  @state() private hasAction = false;

  static styles = css`
    :host {
      display: block;
    }
    .notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink-1);
      font-size: var(--text-fine);
      line-height: var(--line-height);
      box-sizing: border-box;
    }
    .body {
      min-width: 0;
    }
    .body ::slotted(a) {
      color: var(--primary-strong);
    }
    .action {
      flex-shrink: 0;
    }
    .action.empty {
      display: none;
    }
    /* 경고성 안내와 오류는 같은 톤 */
    .danger {
      border-color: var(--danger);
      background: var(--danger-soft);
      color: var(--danger);
    }
  `;

  private onActionSlotChange(e: Event) {
    const nodes = (e.target as HTMLSlotElement).assignedNodes({ flatten: true });
    this.hasAction = nodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
    );
  }

  render() {
    return html`
      <div class="notice ${this.tone}" role=${this.alert ? "alert" : "status"}>
        <span class="body"><slot></slot></span>
        <span class="action ${this.hasAction ? "" : "empty"}">
          <slot name="action" @slotchange=${this.onActionSlotChange}></slot>
        </span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-notice": XNotice;
  }
}