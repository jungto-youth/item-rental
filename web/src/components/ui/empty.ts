import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// 로딩 / 빈 상태 / 에러 — 페이지마다 흩어져 있던 상태 박스를 하나로 통일한다.
// 기본은 디자인 시안의 빈 상태 카드(아이콘 · 제목 · 설명 · 다음 행동),
// compact 는 관리자 목록처럼 한 줄만 필요한 자리에서 쓴다.
@customElement("x-empty")
export class XEmpty extends LitElement {
  @property() state: "loading" | "empty" | "error" = "empty";
  @property() text = "";
  // 제목 아래 한 줄 설명 — "다른 이름으로 검색해 보세요" 같은 다음 행동 안내
  @property() subtitle = "";
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
    }

    /* 빈 상태·오류는 캔버스 위의 흰 카드 — 목록과 같은 테두리 규칙 */
    .box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-5) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      text-align: center;
      box-sizing: border-box;
    }
    .box.loading {
      border: 0;
      background: transparent;
      padding: var(--space-4) var(--space-2);
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-pill);
      background: var(--surface-muted);
      color: var(--ink-3);
    }
    .icon svg {
      width: 24px;
      height: 24px;
    }
    .box.error .icon {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .state {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      margin: 0;
      font-size: var(--text-body);
      font-weight: 600;
      line-height: var(--line-height);
      color: var(--ink-1);
    }
    .box.loading .state {
      font-weight: 400;
      color: var(--ink-2);
    }
    .box.error .state {
      color: var(--ink-1);
    }
    .title {
      margin: var(--space-2) 0 0;
    }
    .subtitle {
      margin: var(--space-1) 0 0;
      max-width: 320px;
      color: var(--ink-2);
      font-size: var(--text-fine);
      line-height: var(--line-height);
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
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-1);
      margin-top: var(--space-2);
    }
    .action.hidden {
      display: none;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* 관리자 목록 등 한 줄짜리 상태 — 테두리·아이콘 없이 */
    :host([compact]) .box {
      display: block;
      padding: 0;
      border: 0;
      background: transparent;
      text-align: left;
    }
    :host([compact]) .icon {
      display: none;
    }
    :host([compact]) .state {
      font-size: var(--text-fine);
      font-weight: 400;
      color: var(--ink-2);
    }
    :host([compact]) .box.error .state {
      color: var(--danger);
    }
    :host([compact]) .title {
      margin: 0;
    }
    :host([compact]) .subtitle {
      margin: var(--space-1) 0 0;
    }
    :host([compact]) .action {
      margin-top: var(--space-1);
    }
  `;

  private get icon() {
    if (this.state === "error") {
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>`;
    }
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>`;
  }

  render() {
    const text =
      this.text ||
      (this.state === "loading"
        ? "불러오는 중…"
        : this.state === "error"
          ? "오류가 발생했어요"
          : "내용이 없어요");
    return html`
      <div class="box ${this.state}" role=${this.state === "error" ? "alert" : "status"}>
        ${this.state === "loading"
          ? html`<div class="state loading">
              <span class="spinner" aria-hidden="true"></span>
              <span>${text}</span>
            </div>`
          : html`
              <span class="icon" aria-hidden="true">${this.icon}</span>
              <p class="state title">${text}</p>
              ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : ""}
            `}
        <div class="action ${this.hasAction ? "" : "hidden"}">
          <slot @slotchange=${this.onSlotChange}></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-empty": XEmpty;
  }
}
