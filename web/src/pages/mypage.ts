import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'
import { session, type SessionUser } from '../context/session'
import '../components/ui/badge'
import type { MyReservation } from '../types'

// SPEC §4.1 — 마이페이지: 프로필 + 내 예약 현황·이력·취소
@customElement('page-mypage')
export class PageMypage extends LitElement {
  @state() private user: SessionUser | null = null
  @state() private loading = true
  @state() private reservations: MyReservation[] = []
  @state() private busy = false
  @state() private message = ''

  static styles = css`
    h1 { font-size: 1.15rem; }
    h2 { font-size: 0.95rem; margin: var(--space-6) 0 var(--space-2); }
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
      background: var(--tone-warning-bg);
      color: var(--tone-warning-text);
    }
    .row {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-3) var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: 0.9rem;
    }
    .row .name { font-weight: 600; }
    .row .dates { color: var(--color-muted); font-size: 0.8rem; }
    .row .spacer { flex: 1; }
    .link {
      background: none;
      border: 0;
      color: var(--color-danger);
      cursor: pointer;
      padding: 2px;
      font-size: 0.8rem;
    }
    .link:disabled { opacity: 0.5; cursor: not-allowed; }
    .note { color: var(--color-muted); font-size: 0.8rem; }
    .empty { color: var(--color-muted); font-size: 0.85rem; }
    .msg { color: var(--color-primary); font-size: 0.85rem; min-height: 1.2em; }
    p { color: var(--color-muted); }
  `

  async connectedCallback() {
    super.connectedCallback()
    this.user = await session.ensure()
    this.loading = false
    if (this.user?.status === 'approved') await this.loadReservations()
  }

  private async loadReservations() {
    try {
      const res = await api<{ reservations: MyReservation[] }>('/api/reservations/mine')
      this.reservations = res.reservations
    } catch (e) {
      this.message = e instanceof Error ? e.message : '오류'
    }
  }

  private async cancel(r: MyReservation) {
    if (!confirm(r.status === 'approved' ? '승인된 예약이에요. 취소할까요?' : '신청을 취소할까요?'))
      return
    if (this.busy) return
    this.busy = true
    try {
      await api(`/api/reservations/${r.id}/cancel`, { method: 'POST' })
      this.message = '취소했어요'
      await this.loadReservations()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '취소 실패'
    } finally {
      this.busy = false
    }
  }

  private renderGroup(title: string, rows: MyReservation[]) {
    if (rows.length === 0) return ''
    return html`
      <h2>${title}</h2>
      ${rows.map((r) => this.renderRow(r))}
    `
  }

  private renderRow(r: MyReservation) {
    return html`
      <div class="row">
        <div>
          <div class="name">${r.item_name}</div>
          <div class="dates">
            ${r.start_date} ~ ${r.end_date}
            (${Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 86400000)}일)
          </div>
        </div>
        <div class="spacer"></div>
        <x-badge kind=${r.is_overdue ? 'overdue' : r.status}></x-badge>
        ${r.status === 'pending' || r.status === 'approved'
          ? html`<button class="link" ?disabled=${this.busy} @click=${() => this.cancel(r)}>취소</button>`
          : ''}
      </div>
      ${r.status === 'rejected' && r.status_note
        ? html`<p class="note">거절 사유: ${r.status_note}</p>`
        : ''}
    `
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
        : html`
            <p class="msg">${this.message}</p>
            ${this.renderGroup(
              '대여 중',
              this.reservations.filter((r) => r.status === 'picked_up'),
            )}
            ${this.renderGroup(
              '승인 대기',
              this.reservations.filter((r) => r.status === 'pending'),
            )}
            ${this.renderGroup(
              '대여 예정',
              this.reservations.filter((r) => r.status === 'approved'),
            )}
            ${this.renderGroup(
              '대여 이력',
              this.reservations.filter(
                (r) => r.status === 'returned' || r.status === 'rejected' || r.status === 'cancelled',
              ),
            )}
            ${this.reservations.length === 0
              ? html`<h2>내 예약</h2><p class="empty">아직 예약 내역이 없어요 — 물품 상세에서 신청할 수 있어요</p>`
              : ''}
          `}
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
