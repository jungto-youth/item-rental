import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'
import { session, type SessionUser } from '../context/session'
import { navigate } from '../router'
import '../components/ui/badge'
import { processPhoto } from '../utils/photo'
import type { Item, ItemStatus } from '../types'

// SPEC §5 — 물품 목록: 검색(키워드+의미) + 가용 배지. 카테고리는 v2.5에서 제거 — 검색으로 탐색
// 운영진(manager 이상)은 여기서 바로 물품을 등록 — 등록 전용 화면 없음 (DESIGN 통합안)
@customElement('page-home')
export class PageHome extends LitElement {
  @state() private items: Item[] = []
  @state() private q = ''
  @state() private loading = true
  @state() private error = ''

  // 등록 폼 (운영진 전용)
  @state() private user: SessionUser | null = null
  @state() private userReady = false
  @state() private creating = false
  @state() private form = { name: '', total_qty: 1, max_days: 7, status: 'active' as ItemStatus, description: '' }
  @state() private staged: File[] = []
  @state() private stagedUrls: string[] = []
  @state() private saving = false
  @state() private createMsg = ''

  static styles = css`
    .top {
      display: grid;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .search {
      flex: 1;
      min-width: 0;
      height: 44px;
      padding: 0 var(--space-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill); /* DESIGN.md §5 — 검색창도 CTA 문법(풀필) */
      background: var(--color-surface);
      color: var(--color-text);
      box-sizing: border-box;
      font-size: 1rem; /* iOS 줌 방지 최소치 */
      font-family: inherit;
    }
    .search:focus { outline: none; border-color: var(--color-primary); }
    .search::placeholder { color: var(--color-muted); }
    .btn-add {
      height: 44px;
      padding: 0 var(--space-4);
      border-radius: var(--radius-pill);
      background: transparent;
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      font: inherit;
      font-size: 1rem;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .btn-add:active { transform: scale(0.95); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--space-3);
    }
    .card {
      display: block;
      text-decoration: none;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .thumb {
      aspect-ratio: 4 / 3;
      background: var(--color-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-muted);
      font-size: 1.6rem;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .meta { padding: var(--space-3) var(--space-4); }
    .name {
      font-weight: 600;
      font-size: var(--text-body);
      letter-spacing: var(--tracking-tight);
      margin-bottom: var(--space-2);
    }
    .empty, .error { color: var(--color-muted); padding: var(--space-6) 0; text-align: center; font-size: var(--text-caption); }
    .error { color: var(--color-danger); }

    /* --- 등록 폼 (운영진) --- */
    .create-form {
      display: grid;
      gap: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-5);
      margin-bottom: var(--space-4);
    }
    .create-form h2 { font-size: 1.0625rem; font-weight: 600; letter-spacing: var(--tracking-tight); margin: 0; }
    .create-form label { font-size: var(--text-caption); color: var(--color-muted); display: grid; gap: 4px; }
    .create-form input, .create-form select, .create-form textarea {
      height: 44px;
      padding: 0 var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text);
      font-size: 1rem;
      font-family: inherit;
      box-sizing: border-box;
    }
    .create-form textarea { height: auto; min-height: 72px; padding: var(--space-3); }
    .create-form input:focus, .create-form select:focus, .create-form textarea:focus { outline: none; border-color: var(--color-primary); }
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
    .form-actions { display: flex; gap: var(--space-2); }
    .btn-ghost {
      height: 44px;
      padding: 0 var(--space-4);
      border-radius: var(--radius-pill);
      background: transparent;
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      font: inherit;
      font-size: 1rem;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .btn-ghost:active { transform: scale(0.95); }
    .msg { color: var(--color-danger); font-size: var(--text-caption); margin: 0; min-height: 1.2em; }
  `

  async connectedCallback() {
    super.connectedCallback()
    this.user = await session.ensure()
    this.userReady = true
    await this.fetchItems()
  }

  private get isManager(): boolean {
    return this.user?.role === 'manager' || this.user?.role === 'admin'
  }

  private async fetchItems() {
    this.loading = true
    this.error = ''
    try {
      const params = new URLSearchParams()
      if (this.q) params.set('q', this.q)
      const { items } = await api<{ items: Item[] }>(`/api/items?${params}`)
      this.items = items
    } catch (e) {
      this.error = e instanceof Error ? e.message : '오류'
    } finally {
      this.loading = false
    }
  }

  private searchTimer = 0
  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.fetchItems(), 300) as unknown as number
  }

  // 사진 404(R2 부재·네트워크 오류) 시 플레이스홀더로 대체 — 콘솔 에러는 브라우저가 남기지만 UI는 깨끗하게 유지
  private onImgError(e: Event) {
    const img = e.target as HTMLImageElement
    const thumb = img.parentElement
    img.remove()
    if (thumb) thumb.textContent = '📦'
  }

  // --- 등록 폼 (운영진) ---
  private openCreate() {
    this.creating = true
    this.createMsg = ''
    this.clearStaged()
    this.form = { name: '', total_qty: 1, max_days: 7, status: 'active', description: '' }
  }

  private closeCreate() {
    this.creating = false
    this.clearStaged()
  }

  private clearStaged() {
    this.stagedUrls.forEach((u) => URL.revokeObjectURL(u))
    this.staged = []
    this.stagedUrls = []
  }

  private static readonly PHOTO_OK = ['image/jpeg', 'image/png', 'image/webp']
  private static readonly MAX_PHOTO_BYTES = 5 * 1024 * 1024

  private async pickStaged(e: Event) {
    const input = e.target as HTMLInputElement
    for (const f of Array.from(input.files ?? [])) {
      if (this.staged.length >= 3) {
        this.createMsg = '사진은 최대 3장이에요'
        break
      }
      if (!PageHome.PHOTO_OK.includes(f.type) || f.size > PageHome.MAX_PHOTO_BYTES) {
        this.createMsg = 'JPEG/PNG/WebP, 5MB 이하만 가능해요'
        continue
      }
      try {
        // 업로드 전 브라우저에서 리사이즈(1600px·WebP) — 변환본만 저장 (§4.2)
        const processed = await processPhoto(f)
        this.staged = [...this.staged, processed]
        this.stagedUrls = [...this.stagedUrls, URL.createObjectURL(processed)]
      } catch (err) {
        this.createMsg = err instanceof Error ? err.message : '이미지 처리 실패'
      }
    }
    input.value = ''
  }

  private removeStaged(i: number) {
    URL.revokeObjectURL(this.stagedUrls[i])
    this.staged = this.staged.filter((_, j) => j !== i)
    this.stagedUrls = this.stagedUrls.filter((_, j) => j !== i)
  }

  private set<K extends keyof typeof this.form>(k: K, v: (typeof this.form)[K]) {
    this.form = { ...this.form, [k]: v }
  }

  private async save() {
    if (this.saving) return // 진행 중 재클릭 → 물품 중복 등록 방지
    this.saving = true
    this.createMsg = ''
    try {
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
      this.closeCreate()
      await this.fetchItems()
      if (failed.length) {
        this.createMsg = `저장했어요 — 사진 업로드 실패(상세에서 다시 올려주세요): ${failed.join(', ')}`
      } else {
        navigate(`/items/${res.id}`) // 등록한 물품으로 바로 이동 — 1회 클릭 저장 완료
      }
    } catch (e) {
      this.createMsg = e instanceof Error ? e.message : '저장 실패'
    } finally {
      this.saving = false
    }
  }

  render() {
    return html`
      ${this.creating ? this.renderCreate() : ''}
      <div class="top">
        ${this.isManager ? html`<button class="btn-add" @click=${this.openCreate}>+ 물품 등록</button>` : ''}
        <input class="search" placeholder="이름·설명·용도로 검색해 보세요" .value=${this.q} @input=${this.onSearch} />
      </div>
      ${this.createMsg ? html`<p class="msg">${this.createMsg}</p>` : ''}
      ${this.error
        ? html`<p class="error">${this.error}</p>`
        : this.loading
          ? html`<p class="empty">불러오는 중…</p>`
          : this.items.length === 0
            ? html`<p class="empty">물품이 없어요</p>`
            : html`
                <div class="grid">
                  ${this.items.map(
                    (it) => html`
                      <a class="card" href="/items/${it.id}">
                        <div class="thumb">
                          ${it.photos[0]
                            ? html`<img src=${it.photos[0].url} alt=${it.name} loading="lazy" @error=${this.onImgError} />`
                            : '📦'}
                        </div>
                        <div class="meta">
                          <div class="name">${it.name}</div>
                          <x-badge kind=${it.availability_badge ?? 'neutral'}></x-badge>
                        </div>
                      </a>
                    `,
                  )}
                </div>
              `}
    `
  }

  private renderCreate() {
    const f = this.form
    return html`
      <form
        class="create-form"
        @submit=${(e: Event) => {
          e.preventDefault()
          this.save()
        }}
      >
        <h2>물품 등록</h2>
        <label>이름
          <input required .value=${f.name} @input=${(e: Event) => this.set('name', (e.target as HTMLInputElement).value)} />
        </label>
        <label>상태
          <select .value=${f.status} @change=${(e: Event) => this.set('status', (e.target as HTMLSelectElement).value as ItemStatus)}>
            <option value="active" ?selected=${f.status === 'active'}>정상</option>
            <option value="repair" ?selected=${f.status === 'repair'}>수리중</option>
            <option value="retired" ?selected=${f.status === 'retired'}>폐기</option>
          </select>
        </label>
        <div class="row">
          <label>보유 수량
            <input type="number" min="1" .value=${String(f.total_qty)} @input=${(e: Event) => this.set('total_qty', Number((e.target as HTMLInputElement).value))} />
          </label>
          <label>최대 대여일
            <input type="number" min="1" max="365" .value=${String(f.max_days)} @input=${(e: Event) => this.set('max_days', Number((e.target as HTMLInputElement).value))} />
          </label>
        </div>
        <label>설명
          <textarea rows="3" .value=${f.description} @input=${(e: Event) => this.set('description', (e.target as HTMLTextAreaElement).value)}></textarea>
        </label>
        <label>사진 (최대 3장 · JPEG/PNG/WebP · 5MB)
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" @change=${this.pickStaged} />
        </label>
        <div class="pics">
          ${this.stagedUrls.map(
            (u, i) => html`
              <div class="pic">
                <img src=${u} alt="" />
                <button type="button" title="삭제" @click=${() => this.removeStaged(i)}>×</button>
              </div>
            `,
          )}
        </div>
        <div class="form-actions">
          <button type="button" class="btn-ghost" @click=${this.closeCreate}>취소</button>
          <button class="btn-add" type="submit" ?disabled=${this.saving}>
            ${this.saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-home': PageHome
  }
}
