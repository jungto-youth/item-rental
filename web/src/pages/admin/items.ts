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
  @state() private staged: File[] = [] // 등록 모드에서 고른 사진 — 저장(id 발급) 후 업로드
  @state() private stagedUrls: string[] = [] // 미리보기용 object URL
  @state() private saving = false // 저장 진행 중 — 버튼 비활성화로 중복 저장 방지
  @state() private message = ''

  static styles = css`
    h1 { font-size: 1.375rem; font-weight: 600; letter-spacing: var(--tracking-tight); line-height: 1.1; }
    .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
    button.primary {
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: 0;
      border-radius: var(--radius-pill); /* 주 CTA 풀필 */
      height: 44px;
      padding: 0 var(--space-5);
      font: inherit;
      font-size: 1rem;
      font-weight: 400;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    button.primary:active:not(:disabled) { transform: scale(0.95); }
    button.primary:disabled { opacity: .55; cursor: default; }
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
    form {
      display: grid;
      gap: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-5);
      margin-bottom: var(--space-4);
    }
    label { font-size: var(--text-caption); color: var(--color-muted); display: grid; gap: 4px; }
    input, select, textarea {
      height: 44px;
      padding: 0 var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg); /* 파치먼트 fill */
      color: var(--color-text);
      font-size: 1rem;
      font-family: inherit;
      box-sizing: border-box;
    }
    textarea { height: auto; min-height: 72px; padding: var(--space-3); }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--color-primary); }
    .row { display: flex; gap: var(--space-3); }
    .row > label { flex: 1; }
    .pics { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .pic { position: relative; width: 72px; height: 72px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--color-border); }
    .pic img { width: 100%; height: 100%; object-fit: cover; }
    /* DESIGN.md §5 — 사진 위 원형 컨트롤 칩 (Apple icon-circular) */
    .pic button {
      position: absolute; top: 2px; right: 2px;
      background: rgba(210, 210, 215, 0.64); color: #1d1d1f; border: 0;
      border-radius: 50%;
      width: 22px; height: 22px; cursor: pointer; line-height: 1;
      font-size: 0.7rem;
    }
    .msg { color: var(--color-primary); font-size: var(--text-caption); min-height: 1.2em; }
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
    this.clearStaged()
    this.form = { name: '', total_qty: 1, max_days: 7, status: 'active', description: '' }
  }

  private async openEdit(it: AdminItem) {
    this.creating = false
    this.editing = it
    this.clearStaged()
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
    this.clearStaged()
  }

  // --- 등록 모드 사진 임시 보관 (업로드는 저장 후) ---
  private clearStaged() {
    this.stagedUrls.forEach((u) => URL.revokeObjectURL(u))
    this.staged = []
    this.stagedUrls = []
  }

  private static readonly PHOTO_OK = ['image/jpeg', 'image/png', 'image/webp']
  private static readonly MAX_PHOTO_BYTES = 5 * 1024 * 1024

  private pickStaged(e: Event) {
    const input = e.target as HTMLInputElement
    for (const f of Array.from(input.files ?? [])) {
      if (this.staged.length >= 3) {
        this.message = '사진은 최대 3장이에요'
        break
      }
      if (!PageAdminItems.PHOTO_OK.includes(f.type) || f.size > PageAdminItems.MAX_PHOTO_BYTES) {
        this.message = 'JPEG/PNG/WebP, 5MB 이하만 가능해요'
        continue
      }
      this.staged = [...this.staged, f]
      this.stagedUrls = [...this.stagedUrls, URL.createObjectURL(f)]
    }
    input.value = ''
  }

  private removeStaged(i: number) {
    URL.revokeObjectURL(this.stagedUrls[i])
    this.staged = this.staged.filter((_, j) => j !== i)
    this.stagedUrls = this.stagedUrls.filter((_, j) => j !== i)
  }

  private async save() {
    if (this.saving) return // 진행 중 재클릭 → 물품 중복 등록 방지
    this.saving = true
    try {
      if (this.creating) {
        const res = await api<{ id: number }>('/api/admin/items', {
          method: 'POST',
          body: JSON.stringify(this.form),
        })
        // 등록 모드에서 고른 사진 — id 발급 직후 업로드 (사진 API는 물품 id 기반)
        const failed: string[] = []
        for (const f of this.staged) {
          const fd = new FormData()
          fd.append('file', f)
          try {
            await api(`/api/admin/items/${res.id}/photos`, { method: 'POST', body: fd })
          } catch {
            failed.push(f.name)
          }
        }
        await this.reload()
        if (failed.length) {
          // 실패한 사진은 편집 모드에서 다시 올릴 수 있게 편집 모드 유지
          const created = this.items.find((it) => it.id === res.id)
          if (created) await this.openEdit(created)
          this.message = `저장했어요 — 사진 업로드 실패: ${failed.join(', ')}`
        } else {
          // 성공이면 목록으로 바로 복귀 — 저장 1회 클릭으로 등록 완료
          this.message = '저장했어요'
          this.close()
        }
      } else if (this.editing) {
        await api(`/api/admin/items/${this.editing.id}`, { method: 'PUT', body: JSON.stringify(this.form) })
        this.message = '저장했어요'
        this.close()
        await this.reload()
      }
    } catch (e) {
      this.message = e instanceof Error ? e.message : '저장 실패'
    } finally {
      this.saving = false
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
          : html`<button class="primary" @click=${this.openCreate}>+ 물품 등록</button>`}
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
        <label>사진 (최대 3장 · JPEG/PNG/WebP · 5MB)
          ${this.creating
            ? html`<input type="file" multiple accept="image/jpeg,image/png,image/webp" @change=${this.pickStaged} />`
            : html`<input type="file" accept="image/jpeg,image/png,image/webp" @change=${this.uploadPhoto} />`}
        </label>
        <div class="pics">
          ${this.creating
            ? this.stagedUrls.map(
                (u, i) => html`
                  <div class="pic">
                    <img src=${u} alt="" />
                    <button type="button" title="삭제" @click=${() => this.removeStaged(i)}>×</button>
                  </div>
                `,
              )
            : this.photos.map(
                (p) => html`
                  <div class="pic">
                    <img src=${p.url} alt="" />
                    <button type="button" title="삭제" @click=${() => this.deletePhoto(p)}>×</button>
                  </div>
                `,
              )}
        </div>
        <button class="primary" type="submit" ?disabled=${this.saving}>${this.saving ? '저장 중…' : '저장'}</button>
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
