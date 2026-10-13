import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { MAX_PHOTO_EDGE } from "../../../../../shared/photo-limits";
import "../../ui/modal";

@customElement("camera-capture-dialog")
export class CameraCaptureDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @state() private starting = false;
  @state() private ready = false;
  @state() private capturing = false;
  @state() private error = "";
  private stream: MediaStream | null = null;
  private generation = 0;

  static styles = css`
    :host { display: contents; }
    video {
      display: block;
      width: 100%;
      max-height: 55vh;
      background: #000;
      border-radius: var(--radius-sm, 6px);
      object-fit: contain;
    }
    .message { margin: 12px 0 0; font-size: var(--text-caption, 13px); }
    .error { color: var(--color-danger); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      cursor: pointer;
    }
    .primary {
      background: var(--color-primary);
      color: var(--color-primary-text, #fff);
      border-color: var(--color-primary);
    }
    button:disabled { opacity: 0.5; cursor: wait; }
    button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  disconnectedCallback() {
    this.stopCamera();
    window.removeEventListener("pagehide", this.onPageHide);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<string | number | symbol, unknown>) {
    super.updated(changed);
    if (changed.has("open")) {
      if (this.open) void this.startCamera();
      else this.stopCamera();
    }
  }

  private onPageHide = () => this.close();
  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.close();
  };

  private stopCamera() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const video = this.renderRoot.querySelector("video");
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    this.ready = false;
    this.starting = false;
    this.capturing = false;
  }

  private async startCamera() {
    if (!this.open || !this.isConnected) return;
    this.stopCamera();
    const generation = this.generation;
    this.starting = true;
    this.error = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (generation !== this.generation || !this.open || !this.isConnected) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => {
          if (this.stream !== stream) return;
          this.stopCamera();
          this.error = "카메라 연결이 끊겼어요. 연결을 확인하고 다시 시도해주세요";
        }, { once: true });
      }
      await this.updateComplete;
      if (generation !== this.generation || !this.open) return;
      const video = this.renderRoot.querySelector("video");
      if (!video) throw new Error("카메라 미리보기를 열 수 없어요");
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation || !this.open) return;
      this.ready = video.videoWidth > 0 && video.videoHeight > 0;
    } catch (err) {
      if (generation !== this.generation || !this.open) return;
      this.stopCamera();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        this.error = "카메라 사용 권한이 없어요. 브라우저와 기기 설정에서 카메라를 허용해주세요";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        this.error = "사용할 수 있는 카메라가 없어요. 카메라 연결과 기기 설정을 확인해주세요";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        this.error = "카메라를 사용할 수 없어요. 다른 앱에서 사용 중인지 확인해주세요";
      } else {
        this.error = "카메라를 열 수 없어요. 브라우저와 카메라 설정을 확인해주세요";
      }
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  private async capture() {
    if (!this.ready || this.capturing || !this.open) return;
    const video = this.renderRoot.querySelector("video");
    if (!video || !video.videoWidth || !video.videoHeight) return;
    this.capturing = true;
    this.error = "";
    const generation = this.generation;
    const canvas = document.createElement("canvas");
    try {
      const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("사진을 만들 수 없어요");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Lossless snapshot; the shared processPhoto path performs the only lossy encode.
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (generation !== this.generation || !this.open || !this.isConnected) return;
      if (!blob) throw new Error("사진을 만들 수 없어요");
      const file = new File([blob], `camera-${Date.now()}.png`, { type: blob.type });
      this.dispatchEvent(new CustomEvent("photo-captured", { detail: { file } }));
      this.close();
    } catch {
      if (generation === this.generation && this.open) this.error = "사진 촬영에 실패했어요. 다시 시도해주세요";
    } finally {
      canvas.width = canvas.height = 0;
      if (generation === this.generation) this.capturing = false;
    }
  }

  close() {
    this.open = false;
    this.stopCamera();
    this.dispatchEvent(new CustomEvent("close"));
  }

  private onModalClose(e: Event) {
    e.stopPropagation();
    this.close();
  }

  render() {
    return html`
      <x-modal ?open=${this.open} title="카메라 촬영" maxWidth="640px" @close=${this.onModalClose}>
        <video autoplay muted playsinline aria-label="카메라 미리보기"></video>
        ${this.starting ? html`<p class="message" role="status">카메라를 열고 있어요. 권한 요청이 나오면 허용해주세요</p>` : ""}
        ${this.error ? html`<p class="message error" role="alert">${this.error}</p>` : ""}
        <div slot="footer" class="actions">
          <button type="button" @click=${this.close}>취소</button>
          ${this.error ? html`<button type="button" ?disabled=${this.starting} @click=${this.startCamera}>다시 시도</button>` : ""}
          <button type="button" class="primary" ?disabled=${!this.ready || this.capturing} @click=${this.capture}>
            ${this.capturing ? "처리 중…" : "촬영"}
          </button>
        </div>
      </x-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "camera-capture-dialog": CameraCaptureDialog;
  }
}
