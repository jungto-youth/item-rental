import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'

type ItemsResponse = { items: unknown[]; q: string; category?: string }

// SPEC §5 — 물품 목록 (2주차에 실구현)
@customElement('page-home')
export class PageHome extends LitElement {
  @state() private items: unknown[] = []
  @state() private error = ''

  static styles = css`
    h1 { font-size: 1.25rem; }
    p { color: var(--color-muted); }
  `

  async connectedCallback() {
    super.connectedCallback()
    try {
      const res = await api<ItemsResponse>('/api/items')
      this.items = res.items
    } catch (e) {
      this.error = e instanceof Error ? e.message : '오류'
    }
  }

  render() {
    return html`
      <h1>물품 목록</h1>
      ${this.error
        ? html`<p>API 오류: ${this.error}</p>`
        : html`<p>등록된 물품 ${this.items.length}개 — 카테고리·검색·가용 배지는 2주차 구현</p>`}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-home': PageHome
  }
}
