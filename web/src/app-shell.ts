import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { initRouter, navigate } from './router'
import { session, type SessionUser } from './context/session'

// 테마 3단계(자동/라이트/다크) — tokens.css의 data-theme 셀렉터와 짝을 이룸.
// 저장값 'light'|'dark', 없으면 시스템 설정 따름.
type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'theme'
// iOS 세그먼티드 컨트롤 문법 — 3개 상태가 아이콘으로 모두 보이고 원하는 것을 직접 누름(순환 없음)
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: '테마 자동' },
  { value: 'light', label: '라이트 모드' },
  { value: 'dark', label: '다크 모드' },
]

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

    /* --- 테마 세그먼티드 컨트롤 — 네비 밖 헤더 오른쪽 끝에 고정(스크롤 안 됨) --- */
    .seg {
      position: relative;
      display: flex;
      flex-shrink: 0;
      margin-left: var(--space-3);
      padding: 2px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.08);
    }
    .seg-thumb {
      position: absolute;
      top: 2px;
      bottom: 2px;
      left: 2px;
      width: calc((100% - 4px) / 3);
      background: rgba(255, 255, 255, 0.22);
      border-radius: var(--radius-pill);
      transition: transform 0.2s ease; /* 선택 세그먼트로 미끄러지는 썸 */
    }
    .seg button {
      position: relative; /* 썸 위에 아이콘 */
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 24px;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: #86868b;
      transition: color 0.2s ease;
    }
    .seg button.on { color: #f5f5f7; }
    .seg button:focus-visible {
      outline: 2px solid var(--color-link-on-dark);
      outline-offset: 1px;
      border-radius: var(--radius-pill);
    }
    .seg svg { width: 14px; height: 14px; display: block; }
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

  // 세그먼트 직접 선택 — 자동이면 저장값을 지워 시스템 설정 추종
  private setTheme(t: Theme) {
    this.theme = t
    try {
      if (t === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, t)
    } catch {
      // 저장 불가 환경에서도 세션 내 선택은 유지
    }
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = t
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

  // 세그먼트 아이콘 — 자동(반원), 라이트(해), 다크(초승달)
  private themeIcon(t: Theme) {
    if (t === 'light') {
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>`
    }
    if (t === 'dark') {
      return html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>`
    }
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>`
  }

  private renderThemeSeg() {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === this.theme)
    return html`
      <div class="seg" role="radiogroup" aria-label="화면 테마" title="화면 테마">
        <span class="seg-thumb" style=${`transform: translateX(${idx * 100}%)`} aria-hidden="true"></span>
        ${THEME_OPTIONS.map(
          (o) => html`
            <button
              type="button"
              role="radio"
              class=${this.theme === o.value ? 'on' : ''}
              aria-checked=${this.theme === o.value}
              aria-label=${o.label}
              title=${o.label}
              @click=${() => this.setTheme(o.value)}
            >
              ${this.themeIcon(o.value)}
            </button>
          `,
        )}
      </div>
    `
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
        </nav>
        ${this.renderThemeSeg()}
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
