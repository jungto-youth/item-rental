import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { initRouter, navigate } from './router'
import { session, type SessionUser } from './context/session'

// 테마 3단계(자동/라이트/다크) — tokens.css의 data-theme 셀렉터와 짝을 이룸.
// 저장값 'light'|'dark', 없으면 시스템 설정 따름.
type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'theme'
const THEME_LABEL: Record<Theme, string> = { system: '테마 자동', light: '라이트', dark: '다크' }

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

@customElement('app-shell')
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null
  @state() private theme: Theme = readStoredTheme()
  private unsubscribe: (() => void) | null = null

  static styles = css`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px; /* DESIGN.md §1 — Apple global-nav 44px */
      padding: 0 var(--space-4);
      background: #000; /* 두 테마 모두 순흑 고정 — 페이지의 유일한 순흑 */
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .brand {
      font-weight: 600;
      font-size: 1rem;
      letter-spacing: var(--tracking-tight);
      text-decoration: none;
      color: #f5f5f7;
      line-height: 44px;
    }
    nav {
      display: flex;
      gap: var(--space-4);
      align-items: center;
      flex-wrap: nowrap;
      justify-content: flex-start;
      flex: 1;
      min-width: 0; /* flex 안에서 overflow-x가 동작하려면 필요 */
      padding-left: var(--space-4); /* 브랜드와 메뉴 사이 간격 */
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none; /* 스크롤바 숨김 — 스와이프 제스처로 탐색 */
    }
    nav::-webkit-scrollbar { display: none; }
    nav a,
    nav button {
      background: none;
      border: none;
      padding: 0;
      font-family: inherit;
      cursor: pointer;
      color: #cccccc; /* Apple body-muted on dark */
      text-decoration: none;
      font-size: var(--text-fine); /* 12px — Apple nav-link */
      line-height: 44px;
      white-space: nowrap; /* 링크 텍스트 줄바꿈 금지 — 좌우 스크롤 */
      flex-shrink: 0; /* 좁아져도 항목이 눌리지 않게 */
    }
    nav a:hover,
    nav button:hover { color: #ffffff; }
    .who {
      color: #86868b;
      font-size: var(--text-fine);
      white-space: nowrap;
      flex-shrink: 0; /* 좁은 화면에서 세로 줄바꿈 방지 */
    }
    main {
      max-width: 640px;
      margin: 0 auto;
      padding: var(--space-4);
      font-size: var(--text-body); /* 본문 17px 기본 (DESIGN.md §4) */
      line-height: 1.47;
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

  // 자동 → 라이트 → 다크 순환. 명시 선택만 localStorage에 남기고 자동은 저장값 제거.
  private toggleTheme() {
    this.theme = this.theme === 'system' ? 'light' : this.theme === 'light' ? 'dark' : 'system'
    try {
      if (this.theme === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, this.theme)
    } catch {
      // 저장 불가 환경에서도 세션 내 전환은 유지
    }
    if (this.theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = this.theme
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
          <a href="/">물품 대여</a>
          ${this.user && (this.user.role === 'manager' || this.user.role === 'admin')
            ? html`<a href="/admin/reservations">대여 관리</a><a href="/admin/members">회원 관리</a>`
            : ''}
          ${this.user
            ? html`
                <span class="who">${this.user.name || this.user.email}</span>
                <a href="/mypage">마이페이지</a>
                <button @click=${this.signOut}>로그아웃</button>
              `
            : html`<a href="/login">로그인</a>`}
          <button class="theme" @click=${this.toggleTheme} title="테마 전환 (자동 → 라이트 → 다크)">
            ${THEME_LABEL[this.theme]}
          </button>
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
