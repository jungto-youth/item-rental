import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'
import { initRouter } from './router'

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
    }
    .brand {
      font-weight: 700;
      text-decoration: none;
      color: var(--color-text);
    }
    nav {
      display: flex;
      gap: var(--space-4);
    }
    nav a {
      color: var(--color-muted);
      text-decoration: none;
    }
    main {
      max-width: 640px;
      margin: 0 auto;
      padding: var(--space-4);
    }
  `

  firstUpdated() {
    const outlet = this.renderRoot.querySelector('main')
    if (outlet) initRouter(outlet)
  }

  render() {
    return html`
      <header>
        <a href="/" class="brand">물품 대여</a>
        <nav>
          <a href="/mypage">마이페이지</a>
          <a href="/login">로그인</a>
        </nav>
      </header>
      <main></main>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}
