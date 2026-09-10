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

// DESIGN.md §5 — 인라인 날짜 범위 캘린더. 두 번 탭: 첫 탭 = 시작일, 두 번 탭 = 반납일.
// 대여는 반개구간 [시작, 반납) — 반납일은 돌려주는 날이라 점유가 아니므로 전량 예약일도
// 반납일로는 선택 가능. 가용 데이터(days×totalQty)로 전량 예약일을 미리 비활성화해
// no_availability를 신청 전에 차단한다. 부모가 선택을 소유하는 controlled 컴포넌트 —
// change 이벤트로 {start, end}를 보고하고 표시는 프로퍼티를 따른다.
@customElement('x-calendar')
export class XCalendar extends LitElement {
  @property({ type: String }) startDate = ''
  @property({ type: String }) endDate = ''
  @property({ type: Array }) days: AvailabilityDay[] = []
  @property({ type: Number }) totalQty = 1
  @property({ type: Number }) maxDays = 7

  @state() private viewY = 0
  @state() private viewM = 0

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
  // 가용 데이터 창 — 그 밖은 데이터가 없어 판정 불가, 선택 불가
  private get minDate(): string {
    return this.days[0]?.date ?? fmt(new Date())
  }
  private get maxDate(): string {
    return this.days[this.days.length - 1]?.date ?? addDays(fmt(new Date()), 89)
  }
  private get today(): string {
    return fmt(new Date())
  }

  // 상태별 선택 가능 판정 — 시작일 고르는 중 / 반납일 고르는 중 / 완료로 규칙이 달라짐
  private isDisabled(d: string, busy: Set<string>): boolean {
    if (d < this.minDate || d > this.maxDate) return true // 과거·창 밖
    if (this.startDate && this.endDate) return busy.has(d) // 선택 완료 — 탭하면 재시작
    if (this.startDate) {
      // 반납일 고르는 중 — 시작일 이전 탭은 시작일 재지정(앵커 이동)
      if (d <= this.startDate) return busy.has(d)
      if (d > addDays(this.startDate, this.maxDays)) return true // 최대 대여일 초과
      // [시작, d) 구간에 전량 예약일이 있으면 그날은 반납일이 될 수 없음
      for (let s = this.startDate; s < d; s = addDays(s, 1)) if (busy.has(s)) return true
      return false
    }
    return busy.has(d) // 시작일 고르는 중 — 전량 예약일엔 시작 불가
  }

  private tap(d: string) {
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
    this.dispatchEvent(
      new CustomEvent('change', { detail: { start, end }, bubbles: true, composed: true }),
    )
  }

  // --- 월 탐색 — 가용 창 안에서만 넘김 ---
  private get viewIdx(): number {
    return this.viewY * 12 + this.viewM - 1
  }
  private idxOf(s: string): number {
    const d = parse(s)
    return d.getFullYear() * 12 + d.getMonth()
  }
  private move(delta: number) {
    const idx = this.viewIdx + delta
    const y = Math.floor(idx / 12)
    this.viewY = y
    this.viewM = idx - y * 12 + 1
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
    const dis = !sel && this.isDisabled(date, busy)
    const inRange =
      !!(this.startDate && this.endDate && date >= this.startDate && date <= this.endDate)
    const cls = [
      'day',
      dis && busy.has(date) && date >= this.minDate ? 'busy' : '',
      inRange ? 'range' : '',
      sel ? 'sel' : '',
      date === this.today ? 'today' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const [, m, d] = date.split('-')
    return html`
      <button
        class=${cls}
        ?disabled=${dis}
        aria-label=${`${Number(m)}월 ${Number(d)}일${dis ? ' — 선택 불가' : sel ? ' — 선택됨' : ''}`}
        @click=${() => this.tap(date)}
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
    .day:not(:disabled):active { transform: scale(0.9); }
    .day:disabled { color: var(--color-muted); opacity: 0.45; cursor: default; }
    .day .num {
      display: inline-block;
      width: 34px;
      height: 34px;
      line-height: 34px; /* inline-block + line-height — flex면 text-decoration(취소선)이 안 먹음 */
      text-align: center;
      border-radius: var(--radius-pill);
    }
    /* 범위 배경은 셀 전체를 칠해 두 끝의 원이 이어져 하나의 띠로 보이게 */
    .day.range { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
    .day.sel .num { background: var(--color-primary); color: var(--color-primary-text); }
    .day.busy .num { text-decoration: line-through; }
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
  `

  render() {
    const busy = this.busyDays
    return html`
      <div class="cal">
        <div class="head">
          <button
            class="nav"
            ?disabled=${this.viewIdx <= this.idxOf(this.minDate)}
            aria-label="이전 달"
            @click=${() => this.move(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <b>${this.viewY}년 ${this.viewM}월</b>
          <button
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
          ${['일', '월', '화', '수', '목', '금', '토'].map((w) => html`<span>${w}</span>`)}
        </div>
        <div class="grid">
          ${this.cells().map((c) => (c ? this.renderDay(c, busy) : html`<span></span>`))}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-calendar': XCalendar
  }
}