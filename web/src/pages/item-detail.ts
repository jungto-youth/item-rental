import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { RouterLocation } from '@vaadin/router'
import { api } from '../api/client'
import { session, type SessionUser } from '../context/session'
import '../components/ui/badge'
import '../components/ui/availability-strip'
import type { AvailabilityDay, Item } from '../types'

// SPEC §5 — 물품 상세 + 대여 신청 폼 (§4.3, 원자적 INSERT는 서버 §8)
@customElement('page-item-detail')
export class PageItemDetail extends LitElement {
  @state() private itemId = ''
  @state() private item: Item | null = null
  @state() private availability: AvailabilityDay[] = []
  @state() private photoIdx = 0
  @state() private error = ''

  // 신청 폼
  @state() private user: SessionUser | null = null
  @state() private userReady = false
  @state() private startDate = ''
  @state() private endDate = ''
  @state() private memo = ''
  @state() private saving = false
  @state() private formMsg = ''
  @state() private formOk = false

  static styles = css`
    .photo {
      aspect-ratio: 4 / 3;
      border-radius: var(--radius);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      overflow: hidden;
    }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .thumbs { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
    .thumbs button {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-sm);
      border: 2px solid transparent;
      padding: 0;
      overflow: hidden;
      cursor: pointer;
      background: var(--color-surface);
    }
    .thumbs button.on { border-color: var(--color-primary-focus); } /* DESIGN.md §5 — 선택 상태 2px 링 */
    .thumbs img { width: 100%; height: 100%; object-fit: cover; }
    h1 { font-size: 1.375rem; font-weight: 600; letter-spacing: var(--tracking-tight); line-height: 1.1; margin: var(--space-4) 0 var(--space-2); }
    .desc { line-height: 1.47; white-space: pre-wrap; }
    .spec {
      display: flex;
      gap: var(--space-6);
      margin: var(--space-4) 0;
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-size: var(--text-body);
    }
    .spec b { display: block; color: var(--color-muted); font-weight: 400; font-size: var(--text-fine); }
    .strip-label { font-size: var(--text-caption); color: var(--color-muted); margin-bottom: var(--space-2); }
    .apply-form {
      margin-top: var(--space-4);
      padding: var(--space-5);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      display: grid;
      gap: var(--space-3);
    }
    .apply-form h2 { font-size: 1.0625rem; font-weight: 600; letter-spacing: var(--tracking-tight); margin: 0; }
    .dates { display: flex; gap: var(--space-3); flex-wrap: wrap; }
    .dates label {
      flex: 1;
      min-width: 140px;
      display: grid;
      gap: 4px;
      font-size: var(--text-caption);
      color: var(--color-muted);
    }
    input, textarea {
      font: inherit;
      font-size: 1rem; /* iOS 줌 방지 */
      padding: 0 var(--space-3);
      height: 44px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); /* DESIGN.md §5 — 입력 필 유틸 8px */
      background: var(--color-bg); /* 화이트 카드 위 파치먼트 fill */
      color: inherit;
      box-sizing: border-box;
      width: 100%;
    }
    textarea { height: auto; min-height: 72px; padding: var(--space-3); resize: vertical; }
    input:focus, textarea:focus { outline: none; border-color: var(--color-primary); }
    .memo { display: grid; gap: 4px; font-size: var(--text-caption); color: var(--color-muted); }
    .hint { margin: 0; font-size: var(--text-caption); color: var(--color-muted); }
    .warn { margin: 0; color: var(--color-danger); font-size: var(--text-caption); }
    .ok { margin: 0; color: var(--color-success); font-size: var(--text-caption); }
    .err { margin: 0; color: var(--color-danger); font-size: var(--text-caption); }
    .primary {
      justify-self: start;
      font: inherit;
      font-size: 1rem;
      font-weight: 400; /* Apple 버튼 문법 */
      height: 44px;
      padding: 0 var(--space-6);
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: none;
      border-radius: var(--radius-pill);
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .primary:active:not(:disabled) { transform: scale(0.95); }
    .primary:focus-visible { outline: 2px solid var(--color-primary-focus); outline-offset: 2px; }
    .primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .notice {
      margin-top: var(--space-4);
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      text-align: center;
      color: var(--color-muted);
      font-size: var(--text-caption);
    }
    .notice a { color: var(--color-primary); }
    .error { color: var(--color-danger); padding: var(--space-6) 0; }
  `

  // @vaadin/router 라이프사이클 — /items/:id 파라미터는 여기서 주입받음
  onAfterEnter(location: RouterLocation) {
    this.itemId = String(location.params.id ?? '')
    if (this.itemId) void this.load()
    else this.error = '물품을 찾을 수 없어요'
  }

  async connectedCallback() {
    super.connectedCallback()
    this.user = await session.ensure()
    this.userReady = true
  }

  private async load() {
    try {
      const res = await api<{ item: Item; availability: AvailabilityDay[] }>(
        `/api/items/${this.itemId}`,
      )
      this.item = res.item
      this.availability = res.availability
    } catch (e) {
      this.error = e instanceof Error ? e.message : '오류'
    }
  }

  // 로컬(브라우저) 기준 오늘 — 과거 날짜 차단의 1차 방어선 (서버는 UTC 기준 백스톱)
  private get today(): string {
    return this.fmt(new Date())
  }

  private fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // 반납일 최소값 — 시작일 다음날 (반개구간 [start, end), 당일 반납 불가)
  private get endMin(): string {
    if (!this.startDate) return this.today
    const d = new Date(this.startDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return this.fmt(d)
  }

  private get rentalDays(): number {
    if (!this.startDate || !this.endDate) return 0
    return Math.round((Date.parse(this.endDate) - Date.parse(this.startDate)) / 86400000)
  }

  // 실시간 폼 검증 — 통과 시 빈 문자열
  private get formError(): string {
    if (!this.item || !this.startDate || !this.endDate) return ''
    if (this.rentalDays < 1) return '반납일은 시작일 이후로 선택해 주세요'
    if (this.rentalDays > this.item.max_days)
      return `최대 ${this.item.max_days}일까지 대여할 수 있어요`
    if (this.startDate < this.today) return '과거 날짜는 선택할 수 없어요'
    return ''
  }

  private setStart(v: string) {
    this.startDate = v
    // 시작일이 바뀌어 반납일이 무효해지면 비움 — 재선택 유도
    if (this.endDate && this.endDate <= v) this.endDate = ''
    this.formMsg = ''
  }

  private async submit(e: Event) {
    e.preventDefault()
    if (this.saving || this.formError || !this.item) return
    this.saving = true
    this.formMsg = ''
    try {
      await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          item_id: Number(this.itemId),
          start_date: this.startDate,
          end_date: this.endDate,
          memo: this.memo || undefined,
        }),
      })
      this.formOk = true
      this.formMsg = '신청했어요 — 마이페이지에서 확인할 수 있어요'
      this.startDate = ''
      this.endDate = ''
      this.memo = ''
      await this.load() // 가용 현황 갱신
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('no_availability'))
        this.formMsg = '선택한 기간에 대여 가능 수량이 없어요. 다른 기간을 선택해 주세요'
      else if (msg.includes('item_not_active'))
        this.formMsg = '지금은 대여할 수 없는 물품이에요'
      else if (msg.includes('too_long'))
        this.formMsg = `최대 ${this.item.max_days}일까지 대여할 수 있어요`
      else if (msg.includes('past_date')) this.formMsg = '과거 날짜는 선택할 수 없어요'
      else if (msg.includes('phone_required'))
        this.formMsg = '연락처를 등록한 후 신청할 수 있어요 — 마이페이지에서 등록해 주세요'
      else this.formMsg = err instanceof Error ? err.message : '신청에 실패했어요'
      this.formOk = false
    } finally {
      this.saving = false
    }
  }

  // 사진 404(R2 부재·네트워크 오류) 시 플레이스홀더로 대체
  // 메인: 📦 텍스트로 교체, 썸네일: 버튼을 비활성화해 선택지에서 제외
  private onMainImgError(e: Event) {
    const img = e.target as HTMLImageElement
    const photo = this.item?.photos[this.photoIdx]
    img.replaceWith(document.createTextNode('📦'))
    // 사라진 사진이 썸네일에도 있으면 해당 썸네일 비활성화
    const idx = this.photoIdx
    const btn = this.renderRoot.querySelectorAll('.thumbs button')[idx] as HTMLButtonElement | undefined
    if (btn) {
      btn.disabled = true
      btn.style.opacity = '0.4'
    }
  }

  private onThumbImgError(e: Event) {
    const img = e.target as HTMLImageElement
    const btn = img.closest('button')
    if (btn) {
      btn.disabled = true
      btn.style.opacity = '0.3'
      btn.replaceChildren(document.createTextNode('✕'))
    }
    img.remove()
  }

  render() {
    if (this.error) return html`<p class="error">${this.error}</p>`
    if (!this.item) return html`<p class="cat">불러오는 중…</p>`

    const photos = this.item.photos
    const main = photos[this.photoIdx]
    return html`
      <div class="photo">
        ${main ? html`<img src=${main.url} alt=${this.item.name} @error=${this.onMainImgError} />` : '📦'}
      </div>
      ${photos.length > 1
        ? html`
            <div class="thumbs">
              ${photos.map(
                (p, i) => html`
                  <button class=${i === this.photoIdx ? 'on' : ''} @click=${() => (this.photoIdx = i)}>
                    <img src=${p.url} alt="" @error=${this.onThumbImgError} />
                  </button>
                `,
              )}
            </div>
          `
        : ''}
      <h1>${this.item.name} <x-badge kind=${this.item.availability_badge ?? this.item.status}></x-badge></h1>
      ${this.item.description ? html`<p class="desc">${this.item.description}</p>` : ''}
      <div class="spec">
        <span><b>보유 수량</b>${this.item.total_qty}개</span>
        <span><b>최대 대여일</b>${this.item.max_days}일</span>
      </div>
      <div class="strip-label">향후 90일 예약 현황</div>
      <availability-strip .days=${this.availability} .totalQty=${this.item.total_qty}></availability-strip>
      ${this.renderApply()}
    `
  }

  // 신청 영역 — 로그인/승인/연락처/물품 상태 분기 (§2 권한)
  private renderApply() {
    if (!this.userReady) return html`<div class="notice">&nbsp;</div>`
    if (!this.user)
      return html`<div class="notice">대여하려면 로그인이 필요해요 — <a href="/login">로그인하기</a></div>`
    if (this.user.status !== 'approved')
      return html`<div class="notice">승인 대기 중이에요 — 관리자 승인 후 신청할 수 있어요</div>`
    if (!this.user.phone)
      return html`<div class="notice">물품을 대여하려면 연락처를 등록해야 해요 — <a href="/signup/profile">연락처 등록하기</a></div>`
    if (this.item!.status !== 'active')
      return html`<div class="notice">지금은 대여할 수 없는 물품이에요 (수리 중/폐기)</div>`
    return this.renderForm()
  }

  private renderForm() {
    const item = this.item!
    return html`
      <form class="apply-form" @submit=${this.submit}>
        <h2>대여 신청</h2>
        <div class="dates">
          <label>
            대여 시작일
            <input
              type="date"
              required
              min=${this.today}
              .value=${this.startDate}
              @change=${(e: Event) => this.setStart((e.target as HTMLInputElement).value)}
            />
          </label>
          <label>
            반납일
            <input
              type="date"
              required
              min=${this.endMin}
              .value=${this.endDate}
              @change=${(e: Event) => {
                this.endDate = (e.target as HTMLInputElement).value
                this.formMsg = ''
              }}
            />
          </label>
        </div>
        <p class="hint">
          ${this.rentalDays > 0
            ? `${this.rentalDays}일 대여 (반납일 제외) · 최대 ${item.max_days}일`
            : '반납일은 물품을 돌려주는 날이에요'}
        </p>
        ${this.formError ? html`<p class="warn">${this.formError}</p>` : ''}
        <label class="memo">
          메모 (선택)
          <textarea
            maxlength="500"
            placeholder="사용 목적 등을 적어주세요"
            .value=${this.memo}
            @input=${(e: Event) => (this.memo = (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
        <button class="primary" type="submit" ?disabled=${this.saving || !!this.formError}>
          ${this.saving ? '신청 중…' : '신청하기'}
        </button>
        ${this.formMsg ? html`<p class=${this.formOk ? 'ok' : 'err'}>${this.formMsg}</p>` : ''}
      </form>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-item-detail': PageItemDetail
  }
}
