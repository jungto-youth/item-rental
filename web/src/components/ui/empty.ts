import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// 로딩 / 빈 상태 / 에러 — 페이지마다 흩어져 있던 상태 박스를 하나로 통일한다.
// 기본(중앙 정렬, 여백) / compact(왼쪽 정렬 한 줄, 관리자 목록 등에서 사용)
@customElement("x-empty")
export class XEmpty extends LitElement {
  @property() state: "loading" | "empty" | "error" = "empty";
  @property() text = "";
  @property({ type: Boolean, reflect: true }) compact = false;
  // 슬롯 액션이 비면 아래 여백을 만들지 않는다
  @state() private hasAction = false;

  private onSlotChange(e: Event) {
    const nodes = (e.target as HTMLSlotElement).assignedNodes({ flatten: true });
    this.hasAction = nodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
    );
  }

  static styles = css`
    :host {
      display: block;
      text-align: center;
      padding: var(--space-4) var(--space-2);
    }
    :host([compact]) {
      text-align: left;
      padding: 0;
    }
    .state {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      margin: 0;
      font-size: var(--text-body);
      line-height: var(--line-height);
    }
    :host([compact]) .state {
      font-size: var(--text-fine);
    }
    .empty,
    .loading {
      color: var(--ink-2);
    }
    .error {
      color: var(--danger);
    }
    .spinner {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      border: 2px solid var(--ink-2);
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    .action {
      margin-top: var(--space-2);
    }
    .action.hidden {
      display: none;
    }
    :host([compact]) .action {
      margin-top: var(--space-1);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  render() {
    const text =
      this.text ||
      (this.state === "loading"
        ? "불러오는 중…"
        : this.state === "error"
          ? "오류가 발생했어요"
          : "내용이 없어요");
    return html`
      <div class="state ${this.state}">
        ${this.state === "loading" ? html`<span class="spinner" aria-hidden="true"></span>` : ""}
        <span>${text}</span>
      </div>
      <div class="action ${this.hasAction ? "" : "hidden"}">
        <slot @slotchange=${this.onSlotChange}></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-empty": XEmpty;
  }
}