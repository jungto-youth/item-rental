import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

const LABELS: Record<string, string> = {
  available: '대여 가능',
  reserved: '예약 있음',
  rented: '대여 중',
  repair: '수리중',
  retired: '폐기',
  // 회원 상태·역할 (v2.7)
  pending: '승인 대기',
  approved: '승인',
  inactive: '비활성',
  user: '회원',
  manager: '관리자',
  admin: '총관리자',
  // 예약 상태 (v2.10)
  picked_up: '대여 중',
  returned: '반납 완료',
  rejected: '거절',
  cancelled: '취소',
  overdue: '연체',
}

@customElement('x-badge')
export class XBadge extends LitElement {
  @property() kind = 'neutral'

  static styles = css`
    span {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .available { background: #dcfce7; color: #166534; }
    .reserved  { background: #fef9c3; color: #854d0e; }
    .rented    { background: #fee2e2; color: #991b1b; }
    .repair    { background: #e0e7ff; color: #3730a3; }
    .retired, .neutral { background: var(--color-border); color: var(--color-muted); }
    .pending   { background: #fef9c3; color: #854d0e; }
    .approved  { background: #dcfce7; color: #166534; }
    .user      { background: #dcfce7; color: #166534; }
    .manager   { background: #e0e7ff; color: #3730a3; }
    .admin     { background: #ede9fe; color: #5b21b6; }
    .picked_up { background: #e0e7ff; color: #3730a3; }
    .returned  { background: #dcfce7; color: #166534; }
    .rejected  { background: #fee2e2; color: #991b1b; }
    .cancelled { background: var(--color-border); color: var(--color-muted); }
    .overdue   { background: #fecaca; color: #7f1d1d; }
  `

  render() {
    return html`<span class=${this.kind}>${LABELS[this.kind] ?? this.kind}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-badge': XBadge
  }
}
