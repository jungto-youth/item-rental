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
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      background: var(--color-surface);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3.5rem;
      box-sizing: border-box;
    }

    .main-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.15s ease;
    }

    .thumbs {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .thumb-btn {
      position: relative;
      width: 60px;
      height: 60px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: var(--radius-sm, 6px);
      background: var(--color-surface);
      overflow: hidden;
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.15s ease, opacity 0.15s ease;
    }

    .thumb-btn.active {
      border-color: var(--color-primary);
    }

    .thumb-btn:hover:not(.active) {
      opacity: 0.85;
    }

    .thumb-btn img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `;

  private handleMainError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = "none";
    const parent = img.parentElement;
    if (parent) parent.textContent = "📦";
  }

  private handleThumbError(e: Event, idx: number) {
    const img = e.target as HTMLImageElement;
    img.style.display = "none";
    const btn = img.parentElement;
    if (btn) {
      btn.textContent = "📦";
      if (idx === this.selectedIdx) {
        // 다음 사진으로 이동
        const next = this.photos.findIndex((_, i) => i !== idx);
        if (next !== -1) this.selectedIdx = next;
      }
    }
  }

  render() {
    const current = this.photos[this.selectedIdx] ?? this.photos[0];

    return html`
      <div class="main-photo">
        ${current
          ? html`<img
              src=${current.url}
              alt=""
              loading="lazy"
              @error=${this.handleMainError}
            />`
          : "📦"}
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
                  >
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
