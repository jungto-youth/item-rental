import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { session, type SessionUser } from '../context/session'
import '../components/ui/badge'

// SPEC §4.1 — 마이페이지 (예약 목록은 3주차)
@customElement('page-mypage')
export class PageMypage extends LitElement {
  @state() private user: SessionUser | null = null
  @state() private loading = true

  static styles = css`
    h1 { font-size: 1.15rem; }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-4);
      display: grid;
      gap: var(--space-2);
      font-size: 0.9rem;
    }
    .pending {
      border-color: var(--color-warning);
      background: #fffbeb;
      color: #92400e;
    }
    p { color: var(--color-muted); }
  `

  async connectedCallback() {
    super.connectedCallback()
    this.user = await session.ensure()
    this.loading = false
  }

  render() {
    if (this.loading) return html`<p>불러오는 중…</p>`
    if (!this.user) return html`<p>로그인이 필요해요</p>`

    return html`
      <h1>마이페이지</h1>
      <div class="card">
        <span><b>${this.user.name || this.user.email}</b></span>
        <span>${this.user.email}</span>
        ${this.user.phone ? html`<span>연락처: ${this.user.phone}</span>` : ''}
        <span>상태: <x-badge kind=${this.user.status === 'approved' ? 'available' : 'neutral'}></x-badge></span>
      </div>
      ${this.user.status === 'pending'
        ? html`
            <div class="card pending" style="margin-top: var(--space-3)">
              승인 대기 중이에요 — 관리자 승인 후 물품을 대여할 수 있어요.
            </div>
          `
        : html`<p>대여 내역은 3주차에 열릴 예정이에요</p>`}
      ${!this.user.phone
        ? html`
            <div class="card" style="margin-top: var(--space-3)">
              물품을 대여하려면 연락처를 등록해야 해요 —
              <a href="/signup/profile">프로필 입력하기</a>
            </div>
          `
        : ''}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-mypage': PageMypage
  }
}
