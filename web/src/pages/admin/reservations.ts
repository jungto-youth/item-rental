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
  @state() private loading = true /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private busy = false
  @state() private message = ''
  @state() private rejectingId: number | null = null
  @state() private rejectReason = ''
  // 승인 시 수량 조정 (§3) — 재고가 모자랄 때 현장에서 줄인다. 신청 수량이 2개 이상일 때만
  // 확인 단계를 열어, 1개짜리 승인에 클릭을 더하지 않는다
  @state() private approvingId: number | null = null
  @state() private approveQty = 1

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
    /* 표 대신 두 줄 로우 — 640px 본문에 테이블이 원래 안 맞아 좌우 스크롤로 처리 버튼이 가려짐 (§4.3) */
    .rows { display: grid; }
    .row {
      border-bottom: 1px solid var(--color-border);
      padding: var(--space-2) 0;
      display: grid;
      gap: var(--space-1);
      font-size: var(--text-caption);
    }
    .head { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; }
    .name { font-weight: 600; font-size: var(--text-body); letter-spacing: var(--tracking-tight); flex: 1; min-width: 0; }
    .head x-badge { flex-shrink: 0; }
    .who, .memo { color: var(--color-muted); }
    .conflict { color: var(--color-warning); font-size: var(--text-fine); }
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
    .head .link { flex-shrink: 0; } /* 액션 링크가 눌리지 않게 — 44px 터치 타깃 유지 */
    .reject { display: flex; align-items: center; gap: var(--space-1); flex: 1; min-width: 0; }
    .reject input {
      font: inherit;
      font-size: var(--text-caption);
      height: 36px;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text);
      flex: 1;
      min-width: 0;
    }
    .conflict { color: var(--color-warning); font-size: var(--text-fine); }
    .reject input[type='number'] { flex: 0 0 auto; max-width: 6rem; }
    .msg { color: var(--color-primary); font-size: var(--text-caption); min-height: 1.2em; }
    .empty { color: var(--color-muted); font-size: var(--text-caption); }
  `

  async connectedCallback() {
    super.connectedCallback()
    // 대시보드 카드 딥링크(?status=…) — 유효한 상태면 필터 미리 적용
    const qs = new URLSearchParams(location.search).get('status')
    if (qs && ['pending', 'approved', 'picked_up', 'returned', 'rejected', 'cancelled'].includes(qs)) {
      this.filter = qs as ReservationStatus
    }
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
    } finally {
      this.loading = false
    }
  }

  private async transition(
    r: AdminReservation,
    action: string,
    body?: Record<string, unknown>,
    okMsg = '',
  ) {
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
      this.approvingId = null
      await this.reload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('bad_status')) this.message = '이미 처리된 예약이에요'
      else if (msg.includes('qty_increase_not_allowed'))
        this.message = '신청 수량보다 늘릴 수는 없어요 — 늘리려면 거절 후 재신청받아 주세요'
      else if (msg.includes('bad_qty')) this.message = '수량은 1개 이상이어야 해요'
      else this.message = msg || '처리에 실패했어요'
      await this.reload()
    } finally {
      this.busy = false
    }
  }

  private startApprove(r: AdminReservation) {
    // 초과 경고 — 정상 흐름에선 0. 0이 아니면 확정 예약만으로 이미 정원인 날이 있다는 뜻이라
    // (동시성 레이스·수량 인하) 관리자 판단이 필요하다 (§3). '겹침 건수' 경고가 아니다
    if (r.conflict_count > 0) {
      if (!confirm(`확정 예약만으로 이미 정원인 날이 ${r.conflict_count}일 있어요. 그래도 승인할까요?`))
        return
    }
    // 1개짜리는 조정할 것이 없다 — 확인 단계 없이 바로 승인
    if (r.qty <= 1) {
      void this.transition(r, 'approve', undefined, '승인했어요')
      return
    }
    this.approvingId = r.id
    this.approveQty = r.qty
    this.message = ''
  }

  private async submitApprove(r: AdminReservation) {
    // 그대로 승인이면 qty를 보내지 않는다 — 서버도 미지정이면 신청 수량을 유지한다
    const body = this.approveQty === r.qty ? undefined : { qty: this.approveQty }
    await this.transition(r, 'approve', body, '승인했어요')
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
      if (this.approvingId === r.id)
        return html`
          <span class="reject">
            <input
              type="number"
              min="1"
              max=${r.qty}
              aria-label="승인 수량"
              .value=${String(this.approveQty)}
              @input=${(e: Event) => (this.approveQty = Number((e.target as HTMLInputElement).value))}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') void this.submitApprove(r)
              }}
            />
            <button class="link" ?disabled=${this.busy} @click=${() => this.submitApprove(r)}>확인</button>
            <button class="link" ?disabled=${this.busy} @click=${() => (this.approvingId = null)}>취소</button>
          </span>
        `
      return html`
        <button class="link" ?disabled=${this.busy} @click=${() => this.startApprove(r)}>승인</button>
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
      ${this.loading
        ? html`<p class="empty">불러오는 중…</p>`
        : this.reservations.length === 0
          ? html`<p class="empty">예약이 없어요</p>`
          : this.renderCards()}
    `
  }

  private renderCards() {
    return html`
      <div class="rows">
        ${this.reservations.map((r) => this.renderCard(r))}
      </div>
    `
  }

  private renderCard(r: AdminReservation) {
    const days = Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 86400000)
    const acts = this.renderActions(r)
    return html`
      <div class="row">
        <span class="head">
          <span class="name">${r.item_name}${r.qty > 1 ? ` · ${r.qty}개` : ''}</span>
          <x-badge kind=${r.is_overdue ? 'overdue' : r.status}></x-badge>
          ${acts}
        </span>
        <span class="who">${r.member_name || '—'} · ${r.member_phone ?? r.member_email} · ${r.start_date}~${r.end_date} (${days}일)</span>
        ${r.member_memo ? html`<span class="memo">메모 · ${r.member_memo}</span>` : ''}
        ${r.status_note ? html`<span class="memo">사유 · ${r.status_note}</span>` : ''}
        ${r.status === 'pending' && r.conflict_count > 0
          ? html`<span class="conflict">정원 초과 ${r.conflict_count}일 — 승인 시 확인 필요</span>`
          : ''}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-admin-reservations': PageAdminReservations
  }
}
