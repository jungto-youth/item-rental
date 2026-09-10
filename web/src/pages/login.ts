import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'

// SPEC §7.2 — 소셜 로그인 (구글 전용)
// @auth/core 0.41은 GET signin/:provider를 지원하지 않으므로(UnknownAction),
// POST signin + CSRF 토큰으로 OAuth 리다이렉트 URL을 받은 뒤 full-page 이동한다.
@customElement('page-login')
export class PageLogin extends LitElement {
  @state() private busy = false
  @state() private message = ''

  // OAuth 콜백에서 로그인이 거부되면 ?error=와 함께 이 화면으로 돌아옴 (§7.2)
  connectedCallback() {
    super.connectedCallback()
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'AccessDenied') {
      this.message = '정토회 계정(@jungto.org)으로 로그인해주세요'
      history.replaceState(null, '', window.location.pathname) // 새로고침 시 재표시 방지
    }
  }

  static styles = css`
    div { text-align: center; padding: var(--space-6) 0; }
    h1 { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
    p { color: var(--color-muted); font-size: 0.85rem; line-height: 1.6; }
    button {
      display: block;
      margin: var(--space-4) auto 0;
      max-width: 260px;
      width: 100%;
      height: 44px; /* DESIGN.md §1 — 터치 타깃 */
      border-radius: var(--radius);
      background: var(--color-primary);
      border: none;
      color: var(--color-primary-text);
      font-weight: 600;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
    }
    button:hover:not(:disabled) { opacity: 0.9; }
    button:disabled { opacity: 0.6; cursor: default; }
    .msg { color: var(--color-danger); font-size: 0.8rem; }
    .links { margin-top: var(--space-4); font-size: 0.75rem; }
    .links a { color: var(--color-muted); margin: 0 var(--space-2); }
  `

  // Auth.js 표준 클라이언트 플로우: csrf → POST signin → {url} → 브라우저 이동
  private async signIn() {
    this.busy = true
    this.message = ''
    try {
      const csrfRes = await fetch('/api/auth/csrf')
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }

      const res = await fetch('/api/auth/signin/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
        },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: window.location.origin + '/',
        }),
      })
      const { url } = (await res.json()) as { url?: string }
      if (!url) throw new Error('로그인 URL을 받지 못했어요')
      window.location.assign(url) // 구글 동의 화면으로 full-page 이동
    } catch (err) {
      this.message = err instanceof Error ? err.message : '로그인에 실패했어요'
      this.busy = false
    }
  }

  render() {
    return html`
      <div>
        <h1>로그인</h1>
        <p>정토회 구글 계정으로 로그인하고, 관리자 승인 후 물품을 대여할 수 있어요</p>
        <button @click=${this.signIn} ?disabled=${this.busy}>
          ${this.busy ? '이동 중…' : '구글로 로그인'}
        </button>
        <p class="msg">${this.message}</p>
        <p class="links">
          <a href="/policy/privacy">개인정보처리방침</a>·<a href="/policy/terms">이용약관</a>
        </p>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-login': PageLogin
  }
}
