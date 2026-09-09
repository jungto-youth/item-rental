import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'
import '../components/ui/badge'
import type { Item } from '../types'

// SPEC §5 — 물품 목록: 검색(키워드+의미) + 가용 배지. 카테고리는 v2.5에서 제거 — 검색으로 탐색
@customElement('page-home')
export class PageHome extends LitElement {
  @state() private items: Item[] = []
  @state() private q = ''
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
    .name { font-weight: 600; font-size: 0.9rem; margin-bottom: var(--space-2); }
    .empty, .error { color: var(--color-muted); padding: var(--space-6) 0; text-align: center; }
    .error { color: var(--color-danger); }
  `

  async connectedCallback() {
    super.connectedCallback()
    await this.fetchItems()
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

  render() {
    return html`
      <input class="search" placeholder="이름·설명·용도로 검색해 보세요" .value=${this.q} @input=${this.onSearch} />
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
