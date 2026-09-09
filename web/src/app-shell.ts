import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { initRouter, navigate } from './router'
import { session, type SessionUser } from './context/session'

@customElement('app-shell')
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null
  private unsubscribe: (() => void) | null = null

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
      align-items: center;
    }
    nav a {
      color: var(--color-muted);
      text-decoration: none;
      font-size: 0.85rem;
    }
    nav a:hover { color: var(--color-text); }
    .who { color: var(--color-muted); font-size: 0.8rem; }
    nav button {
      background: none;
      border: none;
      padding: 0;
      color: var(--color-muted);
      text-decoration: none;
      font-size: 0.85rem;
      font-family: inherit;
      cursor: pointer;
    }
    nav button:hover { color: var(--color-text); }
    main {
      max-width: 640px;
      margin: 0 auto;
      padding: var(--space-4);
    }
  `

  connectedCallback() {
    super.connectedCallback()
    session.ensure()
    this.unsubscribe = session.subscribe(() => {
      this.user = session.user
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubscribe?.()
  }

  firstUpdated() {
    const outlet = this.renderRoot.querySelector('main')
    if (outlet) initRouter(outlet)
  }

  // Auth.js 확인 페이지를 거치지 않고 바로 POST signout (§7.2)
  private async signOut() {
    try {
      const csrfRes = await fetch('/api/auth/csrf')
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
        },
        body: new URLSearchParams({ csrfToken }),
      })
    } catch {
      // 네트워크 오류가 나도 세션 갱신 시도는 진행
    }
    await session.refresh()
    navigate('/')
  }

  render() {
    return html`
      <header>
        <a href="/" class="brand">물품 대여</a>
        <nav>
          ${this.user && (this.user.role === 'manager' || this.user.role === 'admin')
            ? html`<a href="/admin/items">물품 관리</a><a href="/admin/members">회원 관리</a>`
            : ''}
          ${this.user
            ? html`
                <span class="who">${this.user.name || this.user.email}</span>
                <a href="/mypage">마이페이지</a>
                <button @click=${this.signOut}>로그아웃</button>
              `
            : html`<a href="/login">로그인</a>`}
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
