import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, ApiError } from '../../api/client'
import { session } from '../../context/session'
import '../../components/ui/badge'
import type { AdminMember, Role } from '../../types'

// SPEC §4.4 — 회원 관리: 승인/거절(manager 이상), 역할 지정/해제(총관리자만)
// 역할 변경 보호장치는 서버가 강제: 마지막 총관리자 해임 불가, 미승인 회원 임명 불가
@customElement('page-admin-members')
export class PageAdminMembers extends LitElement {
  @state() private members: AdminMember[] = []
  @state() private myRole: Role = 'user'
  @state() private busy = false
  @state() private message = ''

  static styles = css`
    h1 { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      display: block;
      overflow-x: auto;
    }
    th, td { text-align: left; padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    th { color: var(--color-muted); font-weight: 500; font-size: 0.75rem; }
    td.actions button { margin-right: var(--space-1); }
    .link {
      background: none;
      border: 0;
      color: var(--color-primary);
      cursor: pointer;
      padding: var(--space-2);
      font-size: 0.85rem;
      font-family: inherit;
    }
    .link.danger { color: var(--color-danger); }
    select {
      height: 36px;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: 0.8rem;
      font-family: inherit;
    }
    .msg { color: var(--color-primary); font-size: 0.85rem; min-height: 1.2em; }
    .empty { color: var(--color-muted); font-size: 0.85rem; }
  `

  async connectedCallback() {
    super.connectedCallback()
    const user = await session.ensure()
    this.myRole = user?.role ?? 'user'
    await this.reload()
  }

  private async reload() {
    try {
      const res = await api<{ members: AdminMember[] }>('/api/admin/members')
      this.members = res.members
    } catch (e) {
      this.message = e instanceof Error ? e.message : '오류'
    }
  }

  private async approve(m: AdminMember) {
    if (this.busy) return
    this.busy = true
    try {
      await api(`/api/admin/members/${m.id}/approve`, { method: 'POST' })
      this.message = `${m.name || m.email}님을 승인했어요`
      await this.reload()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '승인 실패'
    } finally {
      this.busy = false
    }
  }

  private async reject(m: AdminMember) {
    if (!confirm(`'${m.name || m.email}'님의 가입을 거절할까요?`)) return
    if (this.busy) return
    this.busy = true
    try {
      await api(`/api/admin/members/${m.id}/reject`, { method: 'POST' })
      this.message = '거절했어요'
      await this.reload()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '거절 실패'
    } finally {
      this.busy = false
    }
  }

  // 역할 변경 — 총관리자만 가능 (서버도 requireAdmin으로 강제)
  private async setRole(m: AdminMember, role: Role) {
    if (role === m.role) return
    const label: Record<Role, string> = { user: '회원', manager: '관리자', admin: '총관리자' }
    if (!confirm(`'${m.name || m.email}'님의 역할을 '${label[role]}'(으)로 바꿀까요?`)) {
      await this.reload() // 취소 — select 원복
      return
    }
    if (this.busy) return
    this.busy = true
    try {
      await api(`/api/admin/members/${m.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      })
      this.message = `${m.name || m.email}님의 역할을 '${label[role]}'(으)로 바꿨어요`
      await this.reload()
    } catch (e) {
      // 서버 보호장치(409)에 대한 안내 문구
      const detail = e instanceof Error ? e.message : ''
      if (detail.includes('last_admin')) this.message = '마지막 총관리자는 해임할 수 없어요'
      else if (detail.includes('member_not_approved'))
        this.message = '승인 대기 회원이에요 — 먼저 승인한 후 역할을 바꿀 수 있어요'
      else if (e instanceof ApiError) this.message = e.message
      else this.message = '역할 변경 실패'
      await this.reload() // select 원복
    } finally {
      this.busy = false
    }
  }

  render() {
    return html`
      <h1>회원 관리</h1>
      <p class="msg">${this.message}</p>
      ${this.members.length === 0
        ? html`<p class="empty">아직 회원이 없어요</p>`
        : this.renderTable()}
    `
  }

  private renderTable() {
    return html`
      <table>
        <thead>
          <tr><th>이름</th><th>이메일</th><th>연락처</th><th>상태</th><th>역할</th><th>가입일</th><th></th></tr>
        </thead>
        <tbody>
          ${this.members.map((m) => this.renderRow(m))}
        </tbody>
      </table>
    `
  }

  private renderRow(m: AdminMember) {
    return html`
      <tr>
        <td>${m.name || '—'}</td>
        <td>${m.email}</td>
        <td>${m.phone ?? '—'}</td>
        <td><x-badge kind=${m.status}></x-badge></td>
        <td>
          ${this.myRole === 'admin' && m.status === 'approved'
            ? html`<select
                ?disabled=${this.busy}
                .value=${m.role}
                @change=${(e: Event) => this.setRole(m, (e.target as HTMLSelectElement).value as Role)}
              >
                <option value="user" ?selected=${m.role === 'user'}>회원</option>
                <option value="manager" ?selected=${m.role === 'manager'}>관리자</option>
                <option value="admin" ?selected=${m.role === 'admin'}>총관리자</option>
              </select>`
            : html`<x-badge kind=${m.role}></x-badge>`}
        </td>
        <td>${m.created_at.slice(0, 10)}</td>
        <td class="actions">
          ${m.status === 'pending'
            ? html`
                <button class="link" ?disabled=${this.busy} @click=${() => this.approve(m)}>승인</button>
                <button class="link danger" ?disabled=${this.busy} @click=${() => this.reject(m)}>거절</button>
              `
            : ''}
        </td>
      </tr>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-admin-members': PageAdminMembers
  }
}
