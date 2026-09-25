import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/** 등록/편집 다이얼로그 공용 사진 업로더.
    표시·선택·삭제 이벤트만 담당하고, 업로드/검증/저장은 각 다이얼로그가 처리한다.
    - upload 이벤트: detail { files: File[] }
    - remove 이벤트: detail { key: string | number } */

export type PhotoEntry = { url: string; key: string | number };

@customElement("photo-uploader")
export class PhotoUploader extends LitElement {
  @property({ type: Array }) entries: PhotoEntry[] = [];
  @property({ type: Number }) max = 3;
  @property({ type: Boolean }) multiple = false;
  @property({ type: String }) hint = "JPEG · PNG · WebP, 5MB 이하 · 최대 3장";

  private handleSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;
    this.dispatchEvent(
      new CustomEvent("upload", { detail: { files }, bubbles: true, composed: true }),
    );
  }

  private handleRemove(key: string | number) {
    this.dispatchEvent(
      new CustomEvent("remove", { detail: { key }, bubbles: true, composed: true }),
    );
  }

  static styles = css`
    :host {
      display: block;
    }

    .photos-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .photos-head {
      font-size: var(--text-fine, 12px);
      font-weight: 600;
      color: var(--color-muted);
    }

    .pics {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pic {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: var(--radius-sm, 6px);
      overflow: hidden;
      border: 1px solid var(--color-border);
    }

    .pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pic-del {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 20px;
      height: 20px;
      background: rgba(0, 0, 0, 0.65);
      color: var(--color-on-overlay, #ffffff);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }

    /* ── 사진 업로드 타일 (0장일 때 온전한 드롭존으로 확장) ── */
    .add-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      width: 64px;
      height: 64px;
      box-sizing: border-box;
      border: 1.5px dashed var(--color-border);
      border-radius: var(--radius-sm, 6px);
      color: var(--color-muted);
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
    }

    .add-tile:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
      background: var(--color-primary-tint);
    }

    .add-tile input {
      display: none;
    }

    .add-icon {
      width: 19px;
      height: 19px;
    }

    .add-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.25;
    }

    .add-main {
      font-size: 11px;
      font-weight: 600;
    }

    .add-count {
      font-size: 10px;
      opacity: 0.75;
    }

    .pics:has(.add-tile:only-child) .add-tile {
      width: 100%;
      height: 76px;
      flex-direction: row;
      gap: 12px;
    }

    .pics:has(.add-tile:only-child) .add-icon {
      width: 22px;
      height: 22px;
    }

    .pics:has(.add-tile:only-child) .add-text {
      align-items: flex-start;
    }

    .pics:has(.add-tile:only-child) .add-main {
      font-size: 13px;
    }

    .photo-hint {
      margin: 0;
      font-size: var(--text-fine, 12px);
      color: var(--color-muted);
    }
  `;

  render() {
    const n = this.entries.length;
    return html`
      <div class="photos-box">
        <span class="photos-head">사진 관리 (${n}/${this.max})</span>
        <div class="pics">
          ${this.entries.map(
            (p) => html`
              <div class="pic">
                <img src=${p.url} alt="" />
                <button
                  type="button"
                  class="pic-del"
                  title="삭제"
                  @click=${() => this.handleRemove(p.key)}
                >
                  ×
                </button>
              </div>
            `,
          )}
          ${n < this.max
            ? html`
                <label class="add-tile" title="사진 추가">
                  <input
                    type="file"
                    hidden
                    ?multiple=${this.multiple}
                    accept="image/jpeg,image/png,image/webp"
                    @change=${this.handleSelect}
                  />
                  <svg
                    class="add-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 8h3l1.7-2.3A1 1 0 0 1 9.6 5h4.8a1 1 0 0 1 .9.7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                    />
                    <circle cx="12" cy="13.5" r="3.2" />
                  </svg>
                  <span class="add-text">
                    <span class="add-main">${n === 0 ? "사진 업로드" : "추가"}</span>
                    <small class="add-count">${n}/${this.max}</small>
                  </span>
                </label>
              `
            : ""}
        </div>
        <p class="photo-hint">${this.hint}</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "photo-uploader": PhotoUploader;
  }
}