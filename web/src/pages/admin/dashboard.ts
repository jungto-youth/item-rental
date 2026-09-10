import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../../api/client'
import { navigate } from '../../router'
import type { Dashboard, DashboardRow } from '../../types'

// SPEC §4.4 — 관리자 대시보드: 오늘 수령/반납 예정, 승인 대기, 연체.
// 운영진이 아침에 열어 "오늘 뭘 처리해야 하는지" 한 화면에서 파악 → 대여 관리로 이동해 처리.
@customElement('page-admin-dashboard')
export class PageAdminDashboard extends LitElement {
  @state() private data: Dashboard | null = null
  @state() private error = ''

  static styles = css`
    h1 { font-size: 1.375rem; font-weight: 600; letter-spacing: var(--tracking-tight); line-height: 1.1; }
    .error { color: var(--color-danger); font-size: var(--text-caption); }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-3);
      margin: var(--space-4) 0 var(--space-5);
    }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-4);
      text-align: left;
      font-family: inherit;
      cursor: default;
    }
    .card.link { cursor: pointer; transition: transform 0.15s ease; }
    .card.link:active { transform: scale(0.95); }
    .num { font-size: 2rem; font-weight: 600; letter-spacing: var(--tracking-tight); line-height: 1.1; }
    .num.warn { color: var(--color-warning); }
    .num.danger { color: var(--color-danger); }
    .label { margin-top: var(--space-1); font-size: var(--text-caption); color: var(--color-muted); }
    section { margin-bottom: var(--space-5); }
    h2 { font-size: 1rem; font-weight: 600; letter-spacing: var(--tracking-tight); margin: 0 0 var(--space-2); }
    ul { list-style: none; margin: 0; padding: 0; }
    li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: var(--text-caption);
    }
    .who { color: var(--color-muted); }
    .late { color: var(--color-danger); white-space: nowrap; }
    .empty { color: var(--color-muted); font-size: var(--text-caption); margin: 0; }
    .go {
      background: none;
      border: 0;
      padding: 0;
      color: var(--color-primary);
      font: inherit;
      font-size: var(--text-caption);
      cursor: pointer;
      white-space: nowrap;
    }
  `

  async connectedCallback() {
    super.connectedCallback()
    try {
      this.data = await api<Dashboard>('/api/admin/dashboard')
    } catch (e) {
      this.error = e instanceof Error ? e.message : '오류'
    }
  }

  private goStatus(status: string) {
    navigate(`/admin/reservations?status=${status}`)
  }

  render() {
    if (this.error) {
      return html`<h1>대시보드</h1><p class="error">${this.error}</p>`
    }
    if (!this.data) {
      return html`<h1>대시보드</h1><p class="empty">불러오는 중…</p>`
    }
    const d = this.data
    return html`
      <h1>대시보드</h1>
      <div class="cards">
        <button class="card link" @click=${() => this.goStatus('pending')}>
          <div class="num warn">${d.pending_count}</div>
          <div class="label">승인 대기</div>
        </button>
        <div class="card">
          <div class="num">${d.pickups_count}</div>
          <div class="label">오늘 수령</div>
        </div>
        <div class="card">
          <div class="num">${d.returns_count}</div>
          <div class="label">오늘 반납</div>
        </div>
        <button class="card link" @click=${() => this.goStatus('picked_up')}>
          <div class="num ${d.overdue_count > 0 ? 'danger' : ''}">${d.overdue_count}</div>
          <div class="label">연체</div>
        </button>
      </div>

      ${this.renderList('오늘 수령 예정', d.pickups)}
      ${this.renderList('오늘 반납 예정', d.returns)}
      ${this.renderOverdue(d.overdue)}
    `
  }

  private rowMeta(r: DashboardRow, due: string | TemplateResult) {
    const contact = r.member_phone ? `${r.member_name} · ${r.member_phone}` : r.member_name
    return html`<span class="who">${contact}</span><span>${due}</span>`
  }

  private renderList(title: string, rows: DashboardRow[]) {
    return html`
      <section>
        <h2>${title}</h2>
        ${rows.length === 0
          ? html`<p class="empty">없어요</p>`
          : html`
              <ul>
                ${rows.map(
                  (r) => html`<li><span>${r.item_name}</span>${this.rowMeta(r, r.end_date)}</li>`,
                )}
              </ul>
            `}
      </section>
    `
  }

  private renderOverdue(rows: (DashboardRow & { days_late: number })[]) {
    return html`
      <section>
        <h2>연체</h2>
        ${rows.length === 0
          ? html`<p class="empty">없어요</p>`
          : html`
              <ul>
                ${rows.map(
                  (r) => html`
                    <li>
                      <span>${r.item_name}</span>
                      ${this.rowMeta(r, html`<span class="late">${r.days_late}일 지남</span>`)}
                    </li>
                  `,
                )}
              </ul>
            `}
      </section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-admin-dashboard': PageAdminDashboard
  }
}
