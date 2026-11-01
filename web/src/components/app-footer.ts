import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reduceMotion } from "../styles/motion";

// 공개 화면 하단 — 브랜드 한 줄과 정책 링크. 화면 폭 전체에 헤어라인을 잇고
// 안쪽만 본문 최대 폭에 맞춘다. 정책·404는 흰 면(surface), 그 외는 캔버스 바탕.
@customElement("app-footer")
export class AppFooter extends LitElement {
  @property({ type: Boolean, reflect: true }) surface = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
        border-top: 1px solid var(--border);
      }
      :host([surface]) {
        background: var(--surface);
      }
      .inner {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        max-width: var(--layout-max);
        margin: 0 auto;
        padding: var(--space-4) var(--space-3);
        box-sizing: border-box;
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }
      p {
        margin: 0;
      }
      nav {
        display: flex;
        gap: var(--space-2);
      }
      a {
        color: var(--ink-2);
        text-decoration: none;
      }
      a:hover {
        color: var(--ink-1);
        text-decoration: underline;
      }
      a:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      @media (min-width: 640px) {
        .inner {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }
      @media (max-width: 767px) {
        .inner {
          padding: var(--space-3) var(--space-2);
        }
      }
    `,
  ];

  render() {
    return html`
      <div class="inner">
        <p>정토회 · 함께 쓰는 물품</p>
        <nav aria-label="정책">
          <a href="/policy/terms">이용약관</a>
          <a href="/policy/privacy">개인정보처리방침</a>
        </nav>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-footer": AppFooter;
  }
}
