import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type Photo } from "../../../types";

@customElement("item-gallery")
export class ItemGallery extends LitElement {
  @property({ type: Array }) photos: Photo[] = [];
  @property() name = "";

  @state() private selectedIdx = 0;

  static styles = css`
    :host {
      display: block;
    }

    .main-photo {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      max-height: 480px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-muted);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ink-3);
      box-sizing: border-box;
    }

    .main-photo img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .main-photo .fallback {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .main-photo .fallback svg {
      width: 40px;
      height: 40px;
    }

    .thumbs {
      display: flex;
      gap: var(--space-1);
      margin-top: var(--space-2);
      overflow-x: auto;
      padding-bottom: var(--space-1);
    }

    .thumb-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      padding: var(--space-1);
      border: 1px solid transparent;
      border-radius: var(--radius);
      background: var(--surface-muted);
      color: var(--ink-3);
      overflow: hidden;
      cursor: pointer;
      line-height: var(--line-height-button);
      flex-shrink: 0;
    }

    .thumb-btn.active {
      border-color: var(--primary);
    }

    .thumb-btn img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .thumb-btn .fallback {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumb-btn .fallback svg {
      width: 24px;
      height: 24px;
    }
  `;

  private handleMainError(e: Event) {
    (e.target as HTMLImageElement).remove();
  }

  private handleThumbError(e: Event, idx: number) {
    (e.target as HTMLImageElement).remove();
    if (idx === this.selectedIdx) {
      // 다음 사진으로 이동
      const next = this.photos.findIndex((_, i) => i !== idx);
      if (next !== -1) this.selectedIdx = next;
    }
  }

  // 사진이 없거나 로드에 실패하면 이 아이콘이 남는다 (.pen 썸네일 placeholder)
  private get imageIcon() {
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>`;
  }

  render() {
    const current = this.photos[this.selectedIdx] ?? this.photos[0];

    // 메인 사진은 폴드 위 LCP 요소라 loading="lazy" 를 걸지 않는다 — 오히려
    // 스크롤되기를 기다려 첫 화면이 늦게 뜬다. 썸네일들은 lazy 유지.
    return html`
      <div class="main-photo">
        <span class="fallback" aria-hidden="true">${this.imageIcon}</span>
        ${current
          ? html`<img
              src=${current.url}
              alt=${this.name ? `${this.name} 사진` : "물품 사진"}
              @error=${this.handleMainError}
            />`
          : ""}
      </div>

      ${this.photos.length > 1
        ? html`
            <div class="thumbs">
              ${this.photos.map(
                (p, idx) => html`
                  <button
                    class="thumb-btn ${idx === this.selectedIdx ? "active" : ""}"
                    @click=${() => (this.selectedIdx = idx)}
                    aria-label="사진 ${idx + 1}"
                    aria-pressed=${idx === this.selectedIdx}
                  >
                    <span class="fallback" aria-hidden="true">${this.imageIcon}</span>
                    <img
                      src=${p.url}
                      alt=""
                      loading="lazy"
                      @error=${(e: Event) => this.handleThumbError(e, idx)}
                    />
                  </button>
                `,
              )}
            </div>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-gallery": ItemGallery;
  }
}
