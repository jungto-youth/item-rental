import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'
import '../components/ui/badge'
import type { Category, Item } from '../types'

// SPEC §5 — 물품 목록: 카테고리 필터 + 이름 검색 + 가용 배지
@customElement('page-home')
export class PageHome extends LitElement {
  @state() private categories: Category[] = []
  @state() private items: Item[] = []
  @state() private q = ''
  @state() private category = 0
  @state() private loading = true
  @state() private error = ''

  static styles = css`
    .search {
      width: 100%;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      color: var(--color-text);
      box-sizing: border-box;
      font-size: 1rem;
    }
    .chips {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      padding: var(--space-3) 0;
    }
    .chip {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-muted);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 0.82rem;
      cursor: pointer;
      white-space: nowrap;
    }
    .chip.on {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-primary-text);
    }
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
    .meta { padding: var(--space-2) var(--space-3) var(--space-3); }
    .name { font-weight: 600; font-size: 0.9rem; margin-bottom: var(--space-1); }
    .cat { font-size: 0.72rem; color: var(--color-muted); margin-bottom: var(--space-2); }
    .empty, .error { color: var(--color-muted); padding: var(--space-6) 0; text-align: center; }
    .error { color: var(--color-danger); }
  `

  async connectedCallback() {
    super.connectedCallback()
    try {
      const { categories } = await api<{ categories: Category[] }>('/api/categories')
      this.categories = categories
    } catch { /* 카테고리 로드 실패는 필터만 비활성 */ }
    await this.fetchItems()
  }

  private async fetchItems() {
    this.loading = true
    this.error = ''
    try {
      const params = new URLSearchParams()
      if (this.q) params.set('q', this.q)
      if (this.category) params.set('category', String(this.category))
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

  private pickCategory(id: number) {
    this.category = id
    this.fetchItems()
  }

  render() {
    return html`
      <input class="search" placeholder="물품 검색…" .value=${this.q} @input=${this.onSearch} />
      <div class="chips">
        <button class="chip ${this.category === 0 ? 'on' : ''}" @click=${() => this.pickCategory(0)}>전체</button>
        ${this.categories.map(
          (c) => html`
            <button class="chip ${this.category === c.id ? 'on' : ''}" @click=${() => this.pickCategory(c.id)}>
              ${c.name}
            </button>
          `,
        )}
      </div>
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
                            ? html`<img src=${it.photos[0].url} alt=${it.name} loading="lazy" />`
                            : '📦'}
                        </div>
                        <div class="meta">
                          <div class="name">${it.name}</div>
                          <div class="cat">${it.category_name}</div>
                          <x-badge kind=${it.availability_badge ?? 'neutral'}></x-badge>
                        </div>
                      </a>
                    `,
                  )}
                </div>
              `}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-home': PageHome
  }
}
