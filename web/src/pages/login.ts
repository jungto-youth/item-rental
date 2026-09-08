import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

// SPEC §4.1 — 소셜 로그인 (1주차 Auth.js 연동)
@customElement('page-login')
export class PageLogin extends LitElement {
  static styles = css`
    div { text-align: center; padding: var(--space-6) 0; }
    a {
      display: block;
      margin: var(--space-2) auto;
      max-width: 240px;
      padding: var(--space-3);
      border-radius: var(--radius);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      text-decoration: none;
    }
  `

  render() {
    return html`
      <div>
        <h1>로그인</h1>
        <!-- TODO(1주차): /api/auth/signin/:provider 로 full-page redirect (§7.2) -->
        <a href="/api/auth/signin/google">구글로 로그인</a>
        <a href="/api/auth/signin/kakao">카카오로 로그인</a>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-login': PageLogin
  }
}
