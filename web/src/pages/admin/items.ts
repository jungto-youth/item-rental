import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../../api/client'
import '../../components/ui/badge'
import type { AdminItem, Item, Photo } from '../../types'

// SPEC §4.2 — 관리자 물품 관리 (등록/수정/상태/사진)
// 카테고리는 서버가 이름·설명으로 자동 분류 (§4.2) — 폼에 카테고리 선택 없음
@customElement('page-admin-items')
export class PageAdminItems extends LitElement {
  @state() private items: AdminItem[] = []
  @state() private editing: AdminItem | null = null // null = 목록 모드
  @state() private creating = false
  @state() private form = { name: '', total_qty: 1, max_days: 7, status: 'active', description: '' }
  @state() private photos: Photo[] = [] // 편집 중 물품의 사진
  @state() private message = ''
  @state() private embeddingBusy = false

  static styles = css`
    h1 { font-size: 1.15rem; }
    .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
    button.primary {
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: 0;
      border-radius: var(--radius);
      padding: var(--space-2) var(--space-4);
      cursor: pointer;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      display: block;
      overflow-x: auto;
    }
    th, td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    td.actions button { margin-right: var(--space-1); }
    .link { background: none; border: 0; color: var(--color-primary); cursor: pointer; padding: 2px; }
    .link.danger { color: var(--color-danger); }
    form {
      display: grid;
      gap: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
    }
    label { font-size: 0.75rem; color: var(--color-muted); display: grid; gap: 4px; }
    input, select, textarea {
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
      color: var(--color-text);
      font-size: 0.9rem;
      font-family: inherit;
    }
    .row { display: flex; gap: var(--space-3); }
    .row > label { flex: 1; }
    .pics { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .pic { position: relative; width: 72px; height: 72px; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--color-border); }
    .pic img { width: 100%; height: 100%; object-fit: cover; }
    .pic button {
      position: absolute; top: 0; right: 0;
      background: rgba(0,0,0,.55); color: #fff; border: 0;
      width: 20px; height: 20px; cursor: pointer; line-height: 1;
    }
    .msg { color: var(--color-primary); font-size: 0.85rem; min-height: 1.2em; }
  `

  async connectedCallback() {
    super.connectedCallback()
    await this.reload()
  }

  private async reload() {
    try {
      const res = await api<{ items: AdminItem[] }>('/api/admin/items')
      this.items = res.items
    } catch (e) {
      this.message = e instanceof Error ? e.message : '오류'
    }
  }

  private openCreate() {
    this.creating = true
    this.editing = null
    this.photos = []
    this.form = { name: '', total_qty: 1, max_days: 7, status: 'active', description: '' }
  }

  private async openEdit(it: AdminItem) {
    this.creating = false
    this.editing = it
    this.form = {
      name: it.name,
      total_qty: it.total_qty,
      max_days: it.max_days,
      status: it.status,
      description: it.description ?? '',
    }
    try {
      const res = await api<{ item: Item }>(`/api/items/${it.id}`)
      this.photos = res.item.photos
    } catch { /* 사진 로드 실패는 무시 */ }
  }

  private close() {
    this.creating = false
    this.editing = null
  }

  private async save() {
    try {
      if (this.creating) {
        await api('/api/admin/items', { method: 'POST', body: JSON.stringify(this.form) })
      } else if (this.editing) {
        await api(`/api/admin/items/${this.editing.id}`, { method: 'PUT', body: JSON.stringify(this.form) })
      }
      this.message = '저장했어요'
      this.close()
      await this.reload()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '저장 실패'
    }
  }

  // 임베딩 없는 기존 물품을 일괄 채움 — 보통 1회 (새 물품은 저장 시 자동 생성됨)
  private async backfillEmbeddings() {
    this.embeddingBusy = true
    try {
      const res = await api<{ backfilled: number }>('/api/admin/items/embeddings/backfill', { method: 'POST' })
      this.message = `임베딩 ${res.backfilled}개 물품 생성 완료`
    } catch (e) {
      this.message = e instanceof Error ? e.message : '임베딩 생성 실패'
    } finally {
      this.embeddingBusy = false
    }
  }

  private async removeItem(it: AdminItem) {    if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return
    try {
      await api(`/api/admin/items/${it.id}`, { method: 'DELETE' })
      this.message = '삭제했어요'
      await this.reload()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '삭제 실패'
    }
  }

  private async uploadPhoto(e: Event) {
    if (!this.editing) return
    const input = e.target as HTMLInputElement
    if (!input.files?.[0]) return
    const fd = new FormData()
    fd.append('file', input.files[0])
    try {
      await api(`/api/admin/items/${this.editing.id}/photos`, { method: 'POST', body: fd })
      await this.openEdit(this.editing)
      await this.reload()
    } catch (err) {
      this.message = err instanceof Error ? err.message : '업로드 실패'
    }
    input.value = ''
  }

  private async deletePhoto(p: Photo) {
    if (!this.editing) return
    try {
      await api(`/api/admin/items/${this.editing.id}/photos/${p.id}`, { method: 'DELETE' })
      this.photos = this.photos.filter((x) => x.id !== p.id)
      await this.reload()
    } catch (e) {
      this.message = e instanceof Error ? e.message : '삭제 실패'
    }
  }

  private set<K extends keyof typeof this.form>(k: K, v: (typeof this.form)[K]) {
    this.form = { ...this.form, [k]: v }
  }

  render() {
    return html`
      <div class="bar">
        <h1>물품 관리</h1>
        ${this.creating || this.editing
          ? html`<button class="link" @click=${this.close}>← 목록으로</button>`
          : html`<span>
              <button class="link" @click=${this.backfillEmbeddings} ?disabled=${this.embeddingBusy}>
                ${this.embeddingBusy ? '임베딩 생성 중…' : '임베딩 일괄 생성'}
              </button>
              <button class="primary" @click=${this.openCreate}>+ 물품 등록</button>
            </span>`}
      </div>
      <p class="msg">${this.message}</p>

      ${this.creating || this.editing
        ? this.renderForm()
        : this.renderTable()}
    `
  }

  private renderForm() {
    return html`
      <form @submit=${(e: Event) => { e.preventDefault(); this.save() }}>
        <label>이름
          <input required .value=${this.form.name} @input=${(e: Event) => this.set('name', (e.target as HTMLInputElement).value)} />
        </label>
        <label>상태
          <select .value=${this.form.status} @change=${(e: Event) => this.set('status', (e.target as HTMLSelectElement).value)}>
            <option value="active" ?selected=${this.form.status === 'active'}>정상</option>
            <option value="repair" ?selected=${this.form.status === 'repair'}>수리중</option>
            <option value="retired" ?selected=${this.form.status === 'retired'}>폐기</option>
          </select>
        </label>
        <div class="row">
          <label>보유 수량
            <input type="number" min="1" .value=${String(this.form.total_qty)} @input=${(e: Event) => this.set('total_qty', Number((e.target as HTMLInputElement).value))} />
          </label>
          <label>최대 대여일
            <input type="number" min="1" max="365" .value=${String(this.form.max_days)} @input=${(e: Event) => this.set('max_days', Number((e.target as HTMLInputElement).value))} />
          </label>
        </div>
        <label>설명
          <textarea rows="3" .value=${this.form.description} @input=${(e: Event) => this.set('description', (e.target as HTMLTextAreaElement).value)}></textarea>
        </label>
        ${this.editing
          ? html`
              <label>사진 (최대 3장 · JPEG/PNG/WebP · 5MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" @change=${this.uploadPhoto} />
              </label>
              <div class="pics">
                ${this.photos.map(
                  (p) => html`
                    <div class="pic">
                      <img src=${p.url} alt="" />
                      <button type="button" title="삭제" @click=${() => this.deletePhoto(p)}>×</button>
                    </div>
                  `,
                )}
              </div>
            `
          : ''}
        <button class="primary" type="submit">저장</button>
      </form>
    `
  }

  private renderTable() {
    return html`
      <table>
        <thead>
          <tr><th>ID</th><th>이름</th><th>수량</th><th>상태</th><th>사진</th><th></th></tr>
        </thead>
        <tbody>
          ${this.items.map(
            (it) => html`
              <tr>
                <td>${it.id}</td>
                <td>${it.name}</td>
                <td>${it.total_qty}</td>
                <td><x-badge kind=${it.status}></x-badge></td>
                <td>${it.photo_count}/3</td>
                <td class="actions">
                  <button class="link" @click=${() => this.openEdit(it)}>편집</button>
                  <button class="link danger" @click=${() => this.removeItem(it)}>삭제</button>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-admin-items': PageAdminItems
  }
}
