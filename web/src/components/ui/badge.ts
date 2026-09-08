import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

const LABELS: Record<string, string> = {
  available: '대여 가능',
  reserved: '예약 있음',
  rented: '대여 중',
  repair: '수리중',
  retired: '폐기',
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
