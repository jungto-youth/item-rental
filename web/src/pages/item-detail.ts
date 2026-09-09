import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { RouterLocation } from '@vaadin/router'
import { api } from '../api/client'
import '../components/ui/badge'
import '../components/ui/availability-strip'
import type { AvailabilityDay, Item } from '../types'

// SPEC §5 — 물품 상세 (신청 폼은 3주차)
@customElement('page-item-detail')
export class PageItemDetail extends LitElement {
  @state() private itemId = ''
  @state() private item: Item | null = null
  @state() private availability: AvailabilityDay[] = []
  @state() private photoIdx = 0
  @state() private error = ''

  static styles = css`
    .photo {
      aspect-ratio: 4 / 3;
      border-radius: var(--radius);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      overflow: hidden;
    }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .thumbs { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
    .thumbs button {
      width: 56px;
      height: 56px;
      border-radius: var(--radius);
      border: 2px solid transparent;
      padding: 0;
      overflow: hidden;
      cursor: pointer;
      background: var(--color-surface);
    }
    .thumbs button.on { border-color: var(--color-primary); }
    .thumbs img { width: 100%; height: 100%; object-fit: cover; }
    h1 { font-size: 1.2rem; margin: var(--space-4) 0 var(--space-2); }
    .cat { color: var(--color-muted); font-size: 0.8rem; margin-bottom: var(--space-2); }
    .desc { line-height: 1.6; white-space: pre-wrap; }
    .spec {
      display: flex;
      gap: var(--space-4);
      margin: var(--space-4) 0;
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-size: 0.85rem;
    }
    .spec b { display: block; color: var(--color-muted); font-weight: 500; font-size: 0.72rem; }
    .strip-label { font-size: 0.8rem; color: var(--color-muted); margin-bottom: var(--space-2); }
    .apply {
      margin-top: var(--space-4);
      padding: var(--space-3);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius);
      text-align: center;
      color: var(--color-muted);
      font-size: 0.85rem;
    }
    .error { color: var(--color-danger); padding: var(--space-6) 0; }
  `

  // @vaadin/router 라이프사이클 — /items/:id 파라미터는 여기서 주입받음
  onAfterEnter(location: RouterLocation) {
    this.itemId = String(location.params.id ?? '')
    if (this.itemId) void this.load()
    else this.error = '물품을 찾을 수 없어요'
  }

  private async load() {
    try {
      const res = await api<{ item: Item; availability: AvailabilityDay[] }>(
        `/api/items/${this.itemId}`,
      )
      this.item = res.item
      this.availability = res.availability
    } catch (e) {
      this.error = e instanceof Error ? e.message : '오류'
    }
  }

  render() {
    if (this.error) return html`<p class="error">${this.error}</p>`
    if (!this.item) return html`<p class="cat">불러오는 중…</p>`

    const photos = this.item.photos
    const main = photos[this.photoIdx]
    return html`
      <div class="photo">
        ${main ? html`<img src=${main.url} alt=${this.item.name} />` : '📦'}
      </div>
      ${photos.length > 1
        ? html`
            <div class="thumbs">
              ${photos.map(
                (p, i) => html`
                  <button class=${i === this.photoIdx ? 'on' : ''} @click=${() => (this.photoIdx = i)}>
                    <img src=${p.url} alt="" />
                  </button>
                `,
              )}
            </div>
          `
        : ''}
      <h1>${this.item.name} <x-badge kind=${this.item.availability_badge ?? this.item.status}></x-badge></h1>
      <div class="cat">${this.item.category_name}</div>
      ${this.item.description ? html`<p class="desc">${this.item.description}</p>` : ''}
      <div class="spec">
        <span><b>보유 수량</b>${this.item.total_qty}개</span>
        <span><b>최대 대여일</b>${this.item.max_days}일</span>
      </div>
      <div class="strip-label">향후 90일 예약 현황</div>
      <availability-strip .days=${this.availability} .totalQty=${this.item.total_qty}></availability-strip>
      <div class="apply">대여 신청 기능은 3주차에 열릴 예정이에요</div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-item-detail': PageItemDetail
  }
}
