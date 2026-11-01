import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { MAX_PHOTOS } from "../../../../../shared/photo-limits";
import type { CameraCaptureDialog } from "./camera-capture-dialog";
import "./camera-capture-dialog";
import "../../ui/modal";
import "../../ui/button";

/** 등록/편집 다이얼로그 공용 사진 업로더.
    표시·선택·삭제 이벤트만 담당하고, 업로드/검증/저장은 각 다이얼로그가 처리한다.
    - upload 이벤트: detail { files: File[] }
    - remove 이벤트: detail { key: string | number } */

export type PhotoEntry = { url: string; key: string | number };

@customElement("photo-uploader")
export class PhotoUploader extends LitElement {
  @property({ type: Array }) entries: PhotoEntry[] = [];
  @property({ type: Boolean }) multiple = false;
  @property({ type: Boolean }) disabled = false;
  @state() private cameraMessage = "";
  @state() private chooserOpen = false;
  private cameraDialog: CameraCaptureDialog | null = null;

  private get canAdd() {
    return !this.disabled && this.entries.length < MAX_PHOTOS;
  }

  private openChooser() {
    if (!this.canAdd) return;
    this.chooserOpen = true;
  }

  private chooseCamera() {
    this.chooserOpen = false;
    requestAnimationFrame(() => this.openCamera());
  }

  private chooseFiles() {
    this.chooserOpen = false;
    requestAnimationFrame(() => this.openPicker("photo-files"));
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
      gap: var(--space-1);
    }

    .photos-head {
      font-size: var(--text-fine);
      font-weight: 600;
      color: var(--ink-2);
    }

    .pics {
      display: flex;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .pic {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: var(--radius);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pic-del {
      position: absolute;
      top: var(--space-1);
      right: var(--space-1);
      width: 20px;
      height: 20px;
      background: rgba(0, 0, 0, 0.65);
      color: var(--bg);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-fine);
      line-height: var(--line-height-button);
    }

    /* ── 사진 추가 타일 (0장일 때 온전한 드롭존으로 확장) ── */
    .add-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      width: 64px;
      height: 64px;
      box-sizing: border-box;
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
      color: var(--ink-2);
      background: var(--surface);
      font: inherit;
      cursor: pointer;
      line-height: var(--line-height-button);
      padding: 0;
    }

    .add-tile:hover {
      border-color: var(--primary);
      background: var(--primary-soft);
    }

    .add-tile:hover .add-icon {
      background: var(--surface);
    }

    .add-tile:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    button:disabled {
      opacity: 0.5;
      cursor: wait;
    }

    .add-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--primary-soft);
      color: var(--primary-strong);
    }

    .add-icon svg {
      width: 18px;
      height: 18px;
    }

    .add-main {
      font-size: var(--text-fine);
      font-weight: 600;
      color: var(--ink-1);
    }

    .photo-hint {
      margin: 0;
      font-size: var(--text-fine);
      color: var(--ink-2);
    }

    .chooser-copy {
      margin: 0 0 var(--space-2);
      color: var(--ink-2);
      font-size: var(--text-fine);
    }

    .chooser-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-1);
    }

    .chooser-actions x-button {
      width: 100%;
    }

    @media (max-width: 420px) {
      .chooser-actions {
        grid-template-columns: 1fr;
      }
    }
  `;

  render() {
    const n = this.entries.length;
    return html`
      <div class="photos-box">
        <span class="photos-head">사진 관리 (${n}/${MAX_PHOTOS})</span>
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
          ${n < MAX_PHOTOS
            ? html`
                <button
                  type="button"
                  class="add-tile"
                  title="사진 추가"
                  ?disabled=${this.disabled}
                  @click=${this.openChooser}
                >
                  <span class="add-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  </span>
                  ${n === 0
                    ? html`<span class="add-main">사진 추가</span>`
                    : ""}
                </button>
              `
            : ""}
        </div>
        <x-modal
          ?open=${this.chooserOpen}
          title="사진 추가"
          maxWidth="420px"
          @close=${() => (this.chooserOpen = false)}
        >
          <p class="chooser-copy">사진을 추가할 방법을 선택하세요.</p>
          <div class="chooser-actions">
            <x-button variant="secondary" @click=${this.chooseCamera}>
              사진 촬영
            </x-button>
            <x-button variant="primary" @click=${this.chooseFiles}>
              사진 업로드
            </x-button>
          </div>
          <x-button
            slot="footer"
            variant="secondary"
            @click=${() => (this.chooserOpen = false)}
          >
            취소
          </x-button>
        </x-modal>
        <p class="photo-hint">JPEG · PNG · WebP · 원본 용량 제한 없음 · 최대 ${MAX_PHOTOS}장 · 업로드 전 2MB 이하로 자동 축소</p>
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
