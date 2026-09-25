import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 페이지 제목 헤더 — 제목(--text-page-title/600) + 보조 설명(선택) + 우측 액션 슬롯(선택).
// 페이지마다 반복되던 h1 규칙을 한 곳으로 모은다.
@customElement("x-page-header")
export class XPageHeader extends LitElement {
  @property() title = "";
  @property() subtitle = "";

  static styles = css`
    :host {
      display: block;
      margin-bottom: var(--space-4, 16px);
    }
    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3, 12px);
    }
    h1 {
      font-size: var(--text-page-title, 1.375rem);
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
      line-height: 1.1;
      margin: 0;
      color: var(--color-text);
    }
    .subtitle {
      margin: var(--space-2, 8px) 0 0;
      font-size: var(--text-caption, 13px);
      color: var(--color-muted);
      line-height: 1.47;
    }
    .action {
      flex-shrink: 0;
    }
    .action ::slotted(*) {
      margin: 0;
    }
  `;

  render() {
    return html`
      <div class="row">
        <div>
          <h1>${this.title}</h1>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : ""}
        </div>
        <div class="action"><slot name="action"></slot></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-page-header": XPageHeader;
  }
}