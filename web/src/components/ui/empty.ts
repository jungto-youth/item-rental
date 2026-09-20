import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 로딩 / 빈 상태 / 에러 — 페이지마다 흩어져 있던 상태 박스를 하나로 통일한다.
// 기본(중앙 정렬, 여백) / compact(왼쪽 정렬 한 줄, 관리자 목록 등에서 사용)
@customElement("x-empty")
export class XEmpty extends LitElement {
  @property() state: "loading" | "empty" | "error" = "empty";
  @property() text = "";
  @property({ type: Boolean, reflect: true }) compact = false;

  static styles = css`
    :host {
      display: block;
      text-align: center;
      padding: 32px 16px;
    }
    :host([compact]) {
      text-align: left;
      padding: 0;
    }
    .state {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: 0;
      font-size: var(--text-body, 15px);
      line-height: 1.5;
    }
    :host([compact]) .state {
      font-size: var(--text-caption, 13px);
    }
    .empty,
    .loading {
      color: var(--color-muted);
    }
    .error {
      color: var(--color-danger);
    }
    .spinner {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      border: 2px solid var(--color-muted);
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    ::slotted(*) {
      margin-top: var(--space-3, 12px);
    }
    :host([compact]) ::slotted(*) {
      margin-top: var(--space-2, 8px);
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
      <slot></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-empty": XEmpty;
  }
}