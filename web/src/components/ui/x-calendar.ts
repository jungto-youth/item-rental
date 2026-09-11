import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { AvailabilityDay } from '../../types'

// YYYY-MM-DD 문자열 유틸 — Date.parse는 UTC 자정으로 풀어 타임존 경계에서 하루 밀리므로
// 항상 로컬 시각으로 직접 조립한다 (item-detail의 fmt와 같은 규칙)
function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return fmt(new Date(y, m - 1, d + n))
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 비활성 사유 — aria 라벨의 '선택 불가 (사유)'와 취소선 판정(busy만)에 쓰인다. '' = 선택 가능
const REASONS = {
  past: '과거 날짜',
  window: '예약 가능 기간 밖',
  busy: '전량 예약',
  maxdays: '최대 대여일 초과',
  span: '구간 내 전량 예약일 포함',
} as const
type Reason = keyof typeof REASONS | ''

// DESIGN.md §5 — 인라인 날짜 범위 캘린더. 두 번 탭: 첫 탭 = 시작일, 두 번 탭 = 반납일.
// 대여는 반개구간 [시작, 반납) — 반납일은 돌려주는 날이라 점유가 아니므로 전량 예약일도
// 반납일로는 선택 가능. 가용 데이터(days×totalQty)로 일별 점유를 미리 반영해 no_availability를
// 신청 전에 차단한다 — 서버 INSERT 가드도 같은 일별 점유 기준(§3·§8, v2.11)이라 두 판정이 일치.
// 부모가 선택을 소유하는 controlled 컴포넌트 — change 이벤트로 {start, end}를 보고하고
// 표시는 프로퍼티를 따른다.
@customElement('x-calendar')
export class XCalendar extends LitElement {
  @property({ type: String }) startDate = ''
  @property({ type: String }) endDate = ''
  @property({ type: Array }) days: AvailabilityDay[] = []
  @property({ type: Number }) totalQty = 1
  @property({ type: Number }) maxDays = 7

  @state() private viewY = 0
  @state() private viewM = 0
  @state() private cursor = '' // roving tabindex — Tab이 그리드로 들어오는 지점

  connectedCallback() {
    super.connectedCallback()
    const now = new Date()
    this.viewY = now.getFullYear()
    this.viewM = now.getMonth() + 1
  }

  // availability-strip과 같은 판정 — reserved >= totalQty 면 그날은 대여일로 쓸 수 없음
  private get busyDays(): Set<string> {
    const s = new Set<string>()
    for (const d of this.days) if (d.reserved >= this.totalQty) s.add(d.date)
    return s
  }
  // 가용 데이터 창 — 그 밖은 데이터가 없어 판정 불가
  private get minDate(): string {
    return this.days[0]?.date ?? fmt(new Date())
  }
  private get maxDate(): string {
    return this.days[this.days.length - 1]?.date ?? addDays(fmt(new Date()), 89)
  }
  private get today(): string {
    return fmt(new Date())
  }
  // 선택 하한 — 데이터 창과 '지난 날' 중 늦은 쪽. 서버 가용 창은 UTC라 KST 새벽 0~9시엔
  // days[0]가 로컬 어제가 되므로 로컬 오늘과의 max가 필요 (formError의 과거 차단과 같은 기준)
  private get boundStart(): string {
    return this.minDate > this.today ? this.minDate : this.today
  }

  // 상태별 비활성 판정 — 사유를 반환(''면 선택 가능). 시작일 고르는 중 / 반납일 고르는 중 /
  // 완료로 규칙이 달라지며, 사유는 aria 라벨과 취소선(전량 예약만)에 쓰인다
  private disabledReason(d: string, busy: Set<string>): Reason {
    if (d < this.boundStart) return 'past'
    if (d > this.maxDate) return 'window'
    if (this.startDate && this.endDate) return busy.has(d) ? 'busy' : '' // 선택 완료 — 탭하면 재시작
    if (this.startDate) {
      // 반납일 고르는 중 — 시작일 이전 탭은 시작일 재지정(앵커 이동)
      if (d <= this.startDate) return busy.has(d) ? 'busy' : ''
      if (d > addDays(this.startDate, this.maxDays)) return 'maxdays'
      // [시작, d) 구간에 전량 예약일이 있으면 그날은 반납일이 될 수 없음
      for (let s = this.startDate; s < d; s = addDays(s, 1)) if (busy.has(s)) return 'span'
      return ''
    }
    return busy.has(d) ? 'busy' : '' // 시작일 고르는 중 — 전량 예약일엔 시작 불가
  }

  private tap(d: string) {
    if (this.disabledReason(d, this.busyDays)) return // 비활성 셀 — aria-disabled 클릭 방어
    let start = this.startDate
    let end = this.endDate
    if (!start || end) {
      start = d
      end = ''
    } else if (d > start) {
      end = d
    } else {
      start = d // 반납일 고르다 더 이른 날을 눌렀다면 거기서 다시 시작
      end = ''
    }
    this.cursor = d // 키보드 재진입 지점을 탭한 셀로
    this.dispatchEvent(
      new CustomEvent('change', { detail: { start, end }, bubbles: true, composed: true }),
    )
  }

  // --- 키보드 — roving tabindex + 방향키 이동 (날짜 수만큼 Tab을 누르지 않도록) ---
  private get rove(): string {
    return this.cursor || this.boundStart // 초기 진입점 = 선택 가능한 첫 날(오늘)
  }
  // 커서를 target으로 옮기고(선택 창 안으로 클램프) 뷰가 다른 달이면 따라 이동한 뒤 포커스
  private roveTo(target: string) {
    const t =
      target < this.boundStart ? this.boundStart : target > this.maxDate ? this.maxDate : target
    this.cursor = t
    const tIdx = this.idxOf(t)
    if (tIdx !== this.viewIdx) {
      this.viewY = Math.floor(tIdx / 12)
      this.viewM = tIdx - this.viewY * 12 + 1
    }
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLButtonElement>(`[data-date="${t}"]`)?.focus()
    })
  }
  // 부모('다시 선택')가 포커스를 달력으로 되돌릴 때 — 버튼이 사라지며 body로 낙하하는 것 방지
  focusCursor() {
    this.roveTo(this.rove)
  }
  private onDayKey(e: KeyboardEvent, date: string) {
    let target = ''
    switch (e.key) {
      case 'ArrowRight': target = addDays(date, 1); break
      case 'ArrowLeft': target = addDays(date, -1); break
      case 'ArrowDown': target = addDays(date, 7); break
      case 'ArrowUp': target = addDays(date, -7); break
      case 'Home': target = fmt(new Date(this.viewY, this.viewM - 1, 1)); break // 그 달의 첫 선택 가능일로 클램프됨
      case 'End': target = fmt(new Date(this.viewY, this.viewM, 0)); break
      case 'PageUp': this.move(-1, true); e.preventDefault(); return
      case 'PageDown': this.move(1, true); e.preventDefault(); return
      default: return
    }
    e.preventDefault()
    this.roveTo(target)
  }

  // --- 월 탐색 — 선택 창의 달 안에서만 넘김 ---
  private get viewIdx(): number {
    return this.viewY * 12 + this.viewM - 1
  }
  private idxOf(s: string): number {
    const d = parse(s)
    return d.getFullYear() * 12 + d.getMonth()
  }
  // 뷰는 항상 커서의 달 — days가 늦게 도착해 boundStart가 다음 달로 밀리면(UTC 창 + 음수
  // 오프셋 시간대의 월말 저녁) 뷰가 커서 없는 달에 남아 tabindex=0인 셀이 사라진다(Tab 진입 불가)
  protected updated() {
    if (this.cursor && (this.cursor < this.boundStart || this.cursor > this.maxDate)) {
      this.cursor = '' // 창이 좁아져 커서가 밖으로 — 폴백(하한)으로 되돌림
    }
    const idx = this.idxOf(this.rove)
    if (idx !== this.viewIdx) {
      const y = Math.floor(idx / 12)
      this.viewY = y
      this.viewM = idx - y * 12 + 1
    }
  }
  // 뷰 달에서 처음으로 선택 가능한 날 — 그 달이 전부 비활성이어도 1일은 남겨 Tab 진입점 유지
  private firstSelectable(): string {
    const busy = this.busyDays
    for (let i = 1; i <= new Date(this.viewY, this.viewM, 0).getDate(); i++) {
      const d = fmt(new Date(this.viewY, this.viewM - 1, i))
      if (!this.disabledReason(d, busy)) return d
    }
    return fmt(new Date(this.viewY, this.viewM - 1, 1))
  }
  // 월 이동 + 커서를 새 달 안으로. 포커스는 focus=true(키보드)일 때만 옮긴다 — 네비 버튼
  // 클릭까지 그리드로 포커스를 뺏으면 두 번째 Enter가 1일을 골라버린다
  private move(delta: number, focus = false) {
    const idx = Math.min(
      Math.max(this.viewIdx + delta, this.idxOf(this.boundStart)),
      this.idxOf(this.maxDate),
    )
    if (idx === this.viewIdx) return // 경계 — 네비 버튼 disabled와 동작을 맞춤(설명 없는 점프 방지)
    const y = Math.floor(idx / 12)
    this.viewY = y
    this.viewM = idx - y * 12 + 1
    // 월이 바뀌면 커서를 새 달의 첫 선택 가능일로 — Tab이 곧바로 그리드로 들어오게
    const first = this.firstSelectable()
    if (focus) this.roveTo(first)
    else this.cursor = first
  }

  private cells(): (string | null)[] {
    const lead = new Date(this.viewY, this.viewM - 1, 1).getDay() // 1일의 요일(0=일)
    const last = new Date(this.viewY, this.viewM, 0).getDate()
    const out: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let i = 1; i <= last; i++) out.push(fmt(new Date(this.viewY, this.viewM - 1, i)))
    return out
  }

  private renderDay(date: string, busy: Set<string>) {
    const sel = date === this.startDate || date === this.endDate
    const reason: Reason = sel ? '' : this.disabledReason(date, busy)
    const inRange =
      !!(this.startDate && this.endDate && date >= this.startDate && date <= this.endDate)
    const cls = ['day', reason === 'busy' ? 'busy' : '', inRange ? 'range' : '', sel ? 'sel' : '', date === this.today ? 'today' : '']
      .filter(Boolean)
      .join(' ')
    const [, m, d] = date.split('-')
    const wd = WEEKDAYS[parse(date).getDay()]
    const state = sel ? ' — 선택됨' : reason ? ` — 선택 불가 (${REASONS[reason]})` : ''
    return html`
      <button
        type="button"
        class=${cls}
        tabindex=${date === this.rove ? 0 : -1}
        aria-disabled=${reason !== ''}
        data-date=${date}
        aria-label=${`${Number(m)}월 ${Number(d)}일 ${wd}요일${date === this.today ? ' (오늘)' : ''}${state}`}
        @click=${() => this.tap(date)}
        @keydown=${(e: KeyboardEvent) => this.onDayKey(e, date)}
      ><span class="num">${Number(d)}</span></button>
    `
  }

  static styles = css`
    :host {
      display: block;
      max-width: 420px; /* 640px 본문에서 셀이 과하게 벌어지지 않게 */
    }
    .cal {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); /* 입력 필 유틸 8px — 달력도 입력 필 문법 */
      background: var(--color-bg); /* 화이트 카드 위 파치먼트 fill */
      padding: var(--space-2) var(--space-2) var(--space-3);
      user-select: none;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px; /* DESIGN.md §1 — 터치 타깃 */
    }
    .head b {
      font-size: var(--text-body);
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      background: none;
      border: none;
      border-radius: var(--radius-pill);
      color: var(--color-muted);
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .nav:not(:disabled):active { transform: scale(0.9); }
    .nav:disabled { opacity: 0.35; cursor: default; }
    .nav svg { width: 16px; height: 16px; display: block; }
    .week { display: grid; grid-template-columns: repeat(7, 1fr); }
    .week span {
      text-align: center;
      font-size: var(--text-fine);
      color: var(--color-muted);
      padding-bottom: 2px;
    }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); }
    .day {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px; /* 셀 자체가 터치 타깃 */
      padding: 0;
      background: none;
      border: none;
      font: inherit;
      font-size: var(--text-caption);
      color: var(--color-text);
      cursor: pointer;
      transition: transform 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .day:not([aria-disabled='true']):active { transform: scale(0.9); }
    .day[aria-disabled='true'] { color: var(--color-muted); opacity: 0.45; cursor: default; }
    .day .num {
      display: inline-block;
      width: 34px;
      height: 34px;
      line-height: 34px; /* inline-block + line-height — flex면 text-decoration(취소선)이 안 먹음 */
      text-align: center;
      border-radius: var(--radius-pill);
    }
    /* 범위 배경은 셀 전체를 칠해 두 끝의 원이 이어져 하나의 띠로 보이게 —
       다크에선 밝은 톤 토큰(--color-primary-tint)이라 순흑 위에서도 보임 */
    .day.range { background: var(--color-primary-tint); }
    .day.sel .num { background: var(--color-primary); color: var(--color-primary-text); }
    .day.busy .num { text-decoration: line-through; } /* 취소선은 '그날 자체 전량 예약'에만 */
    .day.today::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 3px;
      width: 3px;
      height: 3px;
      margin-left: -1.5px;
      border-radius: 50%;
      background: var(--color-primary);
    }
    /* DESIGN.md 버튼 문법 — UA 기본 링 대신 토큰 링. 셀 안쪽(-2px)으로 그리드 밀림 없음 */
    .day:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: -2px;
      border-radius: var(--radius-sm);
    }
    .nav:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: -2px;
    }
    .legend {
      margin: var(--space-2) var(--space-1) 0;
      font-size: var(--text-fine);
      color: var(--color-muted);
    }
  `

  render() {
    const busy = this.busyDays
    return html`
      <div class="cal" role="group" aria-label="대여 기간 선택">
        <div class="head">
          <button
            type="button"
            class="nav"
            ?disabled=${this.viewIdx <= this.idxOf(this.boundStart)}
            aria-label="이전 달"
            @click=${() => this.move(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <b>${this.viewY}년 ${this.viewM}월</b>
          <button
            type="button"
            class="nav"
            ?disabled=${this.viewIdx >= this.idxOf(this.maxDate)}
            aria-label="다음 달"
            @click=${() => this.move(1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <div class="week" aria-hidden="true">
          ${WEEKDAYS.map((w) => html`<span>${w}</span>`)}
        </div>
        <div class="grid">
          ${this.cells().map((c) => (c ? this.renderDay(c, busy) : html`<span></span>`))}
        </div>
        ${busy.size > 0
          ? html`<p class="legend">취소선 — 전량 예약일 (반납일로는 고를 수 있어요)</p>`
          : ''}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-calendar': XCalendar
  }
}
