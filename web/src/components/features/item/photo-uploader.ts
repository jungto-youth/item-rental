import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { CameraCaptureDialog } from "./camera-capture-dialog";
import "./camera-capture-dialog";

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
  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean }) active = true;
  @property({ type: String }) hint = "JPEG · PNG · WebP · 원본 용량 제한 없음 · 최대 3장 · 업로드 전 2MB 이하로 자동 축소";
  @state() private cameraMessage = "";
  private cameraDialog: CameraCaptureDialog | null = null;

  private get canAdd() {
    return this.active && !this.disabled && this.entries.length < this.max;
  }

  private openCamera() {
    if (!this.canAdd || this.cameraDialog) return;
    this.cameraMessage = "";
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.cameraMessage = !window.isSecureContext
        ? "실시간 카메라는 HTTPS 또는 localhost에서 사용할 수 있어요. 여기서는 기기의 촬영/파일 선택 화면을 사용해요"
        : "실시간 카메라를 지원하지 않는 브라우저예요. 기기의 촬영/파일 선택 화면을 사용해요";
      this.openPicker("photo-camera");
      return;
    }
    const dialog = document.createElement("camera-capture-dialog");
    this.cameraDialog = dialog;
    dialog.addEventListener("photo-captured", (e) => {
      const { file } = (e as CustomEvent<{ file: File }>).detail;
      this.closeCamera();
      if (this.canAdd) this.dispatchUpload([file]);
    });
    dialog.addEventListener("close", () => this.closeCamera());
    // Place above the item modal without propagating camera-close to the item form.
    document.body.append(dialog);
    dialog.open = true;
  }

  private closeCamera() {
    const dialog = this.cameraDialog;
    this.cameraDialog = null;
    dialog?.remove();
  }

  protected updated(changed: Map<string | number | symbol, unknown>) {
    super.updated(changed);
    if (!this.canAdd) this.closeCamera();
  }

  disconnectedCallback() {
    this.closeCamera();
    super.disconnectedCallback();
  }

  private dispatchUpload(files: File[]) {
    this.dispatchEvent(new CustomEvent("upload", { detail: { files }, bubbles: true, composed: true }));
  }

  private openPicker(id: string) {
    if (!this.canAdd) return;
    this.renderRoot.querySelector<HTMLInputElement>(`#${id}`)?.click();
  }

  private handleSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!this.canAdd || files.length === 0) return;
    this.dispatchUpload(files);
  }

  private handleRemove(key: string | number) {
    if (this.disabled) return;
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
      background: transparent;
      font: inherit;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
    }

    .add-tile:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
      background: var(--color-primary-tint);
    }

    .add-tile:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    button:disabled {
      opacity: 0.5;
      cursor: wait;
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

    .pics:has(.add-tile):not(:has(.pic)) .add-tile {
      flex: 1;
      width: auto;
      height: 76px;
      flex-direction: row;
      gap: 12px;
    }

    .pics:has(.add-tile):not(:has(.pic)) .add-icon {
      width: 22px;
      height: 22px;
    }

    .pics:has(.add-tile):not(:has(.pic)) .add-text {
      align-items: flex-start;
    }

    .pics:has(.add-tile):not(:has(.pic)) .add-main {
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
        <input
          id="photo-files"
          type="file"
          hidden
          ?disabled=${this.disabled}
          ?multiple=${this.multiple}
          accept="image/jpeg,image/png,image/webp"
          @change=${this.handleSelect}
        />
        <!-- 모바일에서 후면 카메라를 요청한다. 미지원 브라우저는 파일 선택기로 폴백. -->
        <input
          id="photo-camera"
          type="file"
          hidden
          ?disabled=${this.disabled}
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          @change=${this.handleSelect}
        />
        <div class="pics">
          ${this.entries.map(
            (p) => html`
              <div class="pic">
                <img src=${p.url} alt="" />
                <button
                  type="button"
                  class="pic-del"
                  title="삭제"
                  ?disabled=${this.disabled}
                  @click=${() => this.handleRemove(p.key)}
                >
                  ×
                </button>
              </div>
            `,
          )}
          ${n < this.max
            ? html`
                <button
                  type="button"
                  class="add-tile"
                  title="사진 촬영"
                  ?disabled=${this.disabled}
                  @click=${this.openCamera}
                >
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
                    <span class="add-main">사진 촬영</span>
                    <small class="add-count">${n}/${this.max}</small>
                  </span>
                </button>
                <button
                  type="button"
                  class="add-tile"
                  title="사진 선택"
                  ?disabled=${this.disabled}
                  @click=${() => this.openPicker("photo-files")}
                >
                  <svg class="add-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8" cy="8" r="1.5" />
                    <path d="m3 17 6-6 4 4 3-3 5 5" />
                  </svg>
                  <span class="add-text">
                    <span class="add-main">사진 선택</span>
                    <small class="add-count">${n}/${this.max}</small>
                  </span>
                </button>
              `
            : ""}
        </div>
        <p class="photo-hint">${this.hint}</p>
        ${this.cameraMessage ? html`<p class="photo-hint" role="status">${this.cameraMessage}</p>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "photo-uploader": PhotoUploader;
  }
}
