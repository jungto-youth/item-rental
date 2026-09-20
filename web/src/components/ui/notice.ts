import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 인라인 안내 배너 — info / warning / danger / success 4톤으로 통일.
// 오른쪽에 액션 버튼을 넣고 싶으면 슬롯 안에 x-button 등을 배치한다.
@customElement("x-notice")
export class XNotice extends LitElement {
  @property() tone: "info" | "warning" | "danger" | "success" = "info";
  @property({ type: Boolean, reflect: true }) alert = false;

  static styles = css`
    :host {
      display: block;
    }
    .notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-caption, 13px);
      line-height: 1.4;
      box-sizing: border-box;
    }
    .body {
      min-width: 0;
    }
    .body ::slotted(a) {
      color: var(--color-primary);
    }
    .action {
      flex-shrink: 0;
    }
    .action:empty {
      display: none;
    }
    .warning {
      border-color: var(--color-warning);
      background: var(--tone-warning-bg);
      color: var(--tone-warning-text);
    }
    .danger {
      border-color: var(--color-danger);
      background: var(--tone-danger-bg);
      color: var(--tone-danger-text);
    }
    .success {
      border-color: var(--color-success);
      background: var(--tone-success-bg);
      color: var(--tone-success-text);
    }
  `;

  render() {
    return html`
      <div class="notice ${this.tone}" role=${this.alert ? "alert" : "status"}>
        <span class="body"><slot></slot></span>
        <span class="action"><slot name="action"></slot></span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-notice": XNotice;
  }
}