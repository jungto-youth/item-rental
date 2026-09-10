import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../../api/client'
import '../../components/ui/badge'
import type { AdminReservation, ReservationStatus } from '../../types'

// SPEC §4.3 — 대여 신청 관리: 승인/거절(사유 필수)/수령/반납 (manager 이상)
// pending 예약은 가용 수량을 차지함 — conflict_count가 0이 아니면 겹침 경고 후 승인 가능 (§3)
@customElement('page-admin-reservations')
export class PageAdminReservations extends LitElement {
  @state() private reservations: AdminReservation[] = []
  @state() private filter: '' | ReservationStatus = ''
  @state() private busy = false
  @state() private message = ''
  @state() private rejectingId: number | null = null
  @state() private rejectReason = ''

  static styles = css`
    h1 { font-size: 1.375rem; font-weight: 600; letter-spacing: var(--tracking-tight); line-height: 1.1; }
    .bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
    .bar label { font-size: var(--text-caption); color: var(--color-muted); }
    select {
      height: 36px;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-caption);
      font-family: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-caption);
      display: block;
      overflow-x: auto;
    }
    th, td { text-align: left; padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    th { color: var(--color-muted); font-weight: 600; font-size: var(--text-fine); }
    td.actions button { margin-right: var(--space-1); }
    .link {
      background: none;
      border: 0;
      color: var(--color-primary);
      cursor: pointer;
      padding: var(--space-2);
      font-size: var(--text-caption);
      font-family: inherit;
    }
    .link.danger { color: var(--color-danger); }
    .link:disabled { opacity: 0.5; cursor: not-allowed; }
    .reject input {
      font: inherit;
      font-size: var(--text-caption);
      height: 36px;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      width: 130px;
    }
    .conflict { color: var(--color-warning); font-size: var(--text-fine); }
    .memo { color: var(--color-muted); font-size: var(--text-fine); }
    .msg { color: var(--color-primary); font-size: var(--text-caption); min-height: 1.2em; }
    .empty { color: var(--color-muted); font-size: var(--text-caption); }
  `

  async connectedCallback() {
    super.connectedCallback()
    await this.reload()
  }

  private async reload() {
    try {
      const qs = this.filter ? `?status=${this.filter}` : ''
      const res = await api<{ reservations: AdminReservation[] }>(
        `/api/admin/reservations${qs}`,
      )
      this.reservations = res.reservations
    } catch (e) {
      this.message = e instanceof Error ? e.message : '오류'
    }
  }

  private async transition(r: AdminReservation, action: string, body?: object, okMsg = '') {
    if (this.busy) return
    this.busy = true
    try {
      await api(`/api/admin/reservations/${r.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
      this.message = okMsg || '처리했어요'
      this.rejectingId = null
      this.rejectReason = ''
      await this.reload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('bad_status')) this.message = '이미 처리된 예약이에요'
      else this.message = msg || '처리에 실패했어요'
      await this.reload()
    } finally {
      this.busy = false
    }
  }

  private async approve(r: AdminReservation) {
    // 겹침 경고 — pending은 가용을 차지하지만 확정 건과 겹치면 관리자 판단 (§3)
    if (r.conflict_count > 0) {
      if (!confirm(`다른 확정 예약과 ${r.conflict_count}건 겹쳐요. 그래도 승인할까요?`)) return
    }
    await this.transition(r, 'approve', undefined, '승인했어요')
  }

  private startReject(r: AdminReservation) {
    this.rejectingId = r.id
    this.rejectReason = ''
    this.message = ''
  }

  private async submitReject(r: AdminReservation) {
    if (!this.rejectReason.trim()) {
      this.message = '거절 사유를 입력해 주세요'
      return
    }
    await this.transition(r, 'reject', { reason: this.rejectReason.trim() }, '거절했어요')
  }

  private renderActions(r: AdminReservation) {
    if (r.status === 'pending') {
      if (this.rejectingId === r.id)
        return html`
          <span class="reject">
            <input
              placeholder="거절 사유 (필수)"
              .value=${this.rejectReason}
              @input=${(e: Event) => (this.rejectReason = (e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') void this.submitReject(r)
              }}
            />
            <button class="link" ?disabled=${this.busy} @click=${() => this.submitReject(r)}>확인</button>
            <button class="link" ?disabled=${this.busy} @click=${() => (this.rejectingId = null)}>취소</button>
          </span>
        `
      return html`
        <button class="link" ?disabled=${this.busy} @click=${() => this.approve(r)}>승인</button>
        <button class="link danger" ?disabled=${this.busy} @click=${() => this.startReject(r)}>거절</button>
      `
    }
    if (r.status === 'approved')
      return html`<button class="link" ?disabled=${this.busy} @click=${() => this.transition(r, 'pickup', undefined, '수령 처리했어요')}>수령</button>`
    if (r.status === 'picked_up')
      return html`<button class="link" ?disabled=${this.busy} @click=${() => this.transition(r, 'return', undefined, '반납 처리했어요')}>반납</button>`
    return ''
  }

  render() {
    return html`
      <h1>대여 관리</h1>
      <div class="bar">
        <label>상태</label>
        <select
          .value=${this.filter}
          @change=${(e: Event) => {
            this.filter = (e.target as HTMLSelectElement).value as '' | ReservationStatus
            this.rejectingId = null
            void this.reload()
          }}
        >
          <option value="" ?selected=${this.filter === ''}>전체</option>
          <option value="pending" ?selected=${this.filter === 'pending'}>승인 대기</option>
          <option value="approved" ?selected=${this.filter === 'approved'}>승인</option>
          <option value="picked_up" ?selected=${this.filter === 'picked_up'}>대여 중</option>
          <option value="returned" ?selected=${this.filter === 'returned'}>반납 완료</option>
          <option value="rejected" ?selected=${this.filter === 'rejected'}>거절</option>
          <option value="cancelled" ?selected=${this.filter === 'cancelled'}>취소</option>
        </select>
      </div>
      <p class="msg">${this.message}</p>
      ${this.reservations.length === 0
        ? html`<p class="empty">예약이 없어요</p>`
        : this.renderTable()}
    `
  }

  private renderTable() {
    return html`
      <table>
        <thead>
          <tr>
            <th>물품</th><th>신청자</th><th>기간</th><th>상태</th><th>메모</th><th>거절 사유</th><th>신청일</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${this.reservations.map((r) => this.renderRow(r))}
        </tbody>
      </table>
    `
  }

  private renderRow(r: AdminReservation) {
    const days = Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 86400000)
    return html`
      <tr>
        <td>${r.item_name}</td>
        <td>${r.member_name || '—'}<br /><span class="memo">${r.member_phone ?? r.member_email}</span></td>
        <td>${r.start_date}<br />~ ${r.end_date} (${days}일)</td>
        <td>
          <x-badge kind=${r.is_overdue ? 'overdue' : r.status}></x-badge>
          ${r.status === 'pending' && r.conflict_count > 0
            ? html`<br /><span class="conflict">겹침 ${r.conflict_count}건</span>`
            : ''}
        </td>
        <td>${r.member_memo ?? '—'}</td>
        <td>${r.status_note ?? '—'}</td>
        <td>${r.created_at.slice(0, 10)}</td>
        <td class="actions">${this.renderActions(r)}</td>
      </tr>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-admin-reservations': PageAdminReservations
  }
}
