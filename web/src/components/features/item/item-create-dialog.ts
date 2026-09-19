import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../../../utils/photo";
import { type ItemKind, type ItemStatus } from "../../../types";
import "../../ui/modal";
import "../../ui/button";
import "./photo-uploader";

const EMPTY_FORM = {
  name: "",
  kind: "rental" as ItemKind,
  total_qty: 1,
  qty_broken: 0,
  status: "active" as ItemStatus,
  description: "",
  location: "",
};

@customElement("item-create-dialog")
export class ItemCreateDialog extends LitElement {
  @property({ type: Boolean }) open = false;

  @state() private form = { ...EMPTY_FORM };
  @state() private staged: File[] = [];
  @state() private stagedUrls: string[] = [];
  @state() private saving = false;
  @state() private error = "";

  static styles = css`
    :host {
      display: contents;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--text-fine, 12px);
      font-weight: 600;
      color: var(--color-muted);
    }

    input, select, textarea {
      padding: 0 12px;
      height: 42px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--text-body, 15px);
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }

    textarea {
      height: auto;
      padding: 10px 12px;
      resize: vertical;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--color-primary);
      background: var(--color-bg);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .error-msg {
      color: var(--color-danger);
      font-size: var(--text-caption, 13px);
      margin: 0;
    }

    `;

  private set<K extends keyof typeof this.form>(k: K, v: (typeof this.form)[K]) {
    this.form = { ...this.form, [k]: v };
  }

  private async pickStaged(files: File[]) {
    for (const f of files) {
      if (this.staged.length >= 3) {
        this.error = "사진은 최대 3장까지 등록할 수 있어요";
        break;
      }
      if (!PHOTO_OK.includes(f.type) || f.size > MAX_PHOTO_BYTES) {
        this.error = "JPEG/PNG/WebP 5MB 이하 파일만 가능해요";
        continue;
      }
      try {
        const processed = await processPhoto(f);
        this.staged = [...this.staged, processed];
        this.stagedUrls = [...this.stagedUrls, URL.createObjectURL(processed)];
      } catch (err) {
        this.error = err instanceof Error ? err.message : "이미지 처리 실패";
      }
    }
  }

  private removeStaged(i: number) {
    URL.revokeObjectURL(this.stagedUrls[i]);
    this.staged = this.staged.filter((_, j) => j !== i);
    this.stagedUrls = this.stagedUrls.filter((_, j) => j !== i);
  }

  private clearStaged() {
    for (const u of this.stagedUrls) URL.revokeObjectURL(u);
    this.staged = [];
    this.stagedUrls = [];
  }

  private onPhotoUpload(e: CustomEvent<{ files: File[] }>) {
    void this.pickStaged(e.detail.files);
  }

  private onPhotoRemove(e: CustomEvent<{ key: string | number }>) {
    this.removeStaged(Number(e.detail.key));
  }

  private handleClose = () => {
    this.clearStaged();
    this.form = { ...EMPTY_FORM };
    this.error = "";
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };

  private async handleSave(e: Event) {
    e.preventDefault();
    if (this.saving) return;
    this.saving = true;
    this.error = "";

    try {
      const res = await api<{ id: number }>("/api/admin/items", {
        method: "POST",
        body: JSON.stringify(this.form),
      });

      const failed: string[] = [];
      for (const f of this.staged) {
        const fd = new FormData();
        fd.append("file", f);
        try {
          await api(`/api/admin/items/${res.id}/photos`, {
            method: "POST",
            body: fd,
          });
        } catch {
          failed.push(f.name);
        }
      }

      this.clearStaged();
      this.form = { ...EMPTY_FORM };
      this.dispatchEvent(
        new CustomEvent("created", {
          detail: { id: res.id, failedPhotos: failed },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      this.error = err instanceof Error ? err.message : "물품 등록에 실패했어요";
    } finally {
      this.saving = false;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearStaged();
  }

  render() {
    const f = this.form;
    return html`
      <x-modal ?open=${this.open} title="물품 등록" @close=${this.handleClose}>
        <form id="create-item-form" @submit=${this.handleSave}>
          ${this.error ? html`<p class="error-msg">${this.error}</p>` : ""}

          <label>
            이름 *
            <input
              required
              .value=${f.name}
              @input=${(e: Event) => this.set("name", (e.target as HTMLInputElement).value)}
            />
          </label>

          <div class="row">
            <label>
              구분
              <select
                .value=${f.kind}
                @change=${(e: Event) =>
                  this.set("kind", (e.target as HTMLSelectElement).value as ItemKind)}
              >
                <option value="rental" ?selected=${f.kind === "rental"}>대여품</option>
                <option value="consumable" ?selected=${f.kind === "consumable"}>소모품</option>
              </select>
            </label>
            <label>
              상태
              <select
                .value=${f.status}
                @change=${(e: Event) =>
                  this.set("status", (e.target as HTMLSelectElement).value as ItemStatus)}
              >
                <option value="active" ?selected=${f.status === "active"}>정상</option>
                <option value="repair" ?selected=${f.status === "repair"}>수리중</option>
                <option value="retired" ?selected=${f.status === "retired"}>폐기</option>
              </select>
            </label>
          </div>

          <div class="row">
            <label>
              보유 수량 *
              <input
                type="number"
                min="1"
                required
                .value=${String(f.total_qty)}
                @input=${(e: Event) =>
                  this.set("total_qty", Number((e.target as HTMLInputElement).value))}
              />
            </label>
            ${f.kind === "rental"
              ? html`
                  <label>
                    수리중 수량
                    <input
                      type="number"
                      min="0"
                      .value=${String(f.qty_broken)}
                      @input=${(e: Event) =>
                        this.set("qty_broken", Number((e.target as HTMLInputElement).value))}
                    />
                  </label>
                `
              : ""}
          </div>

          <label>
            보관 위치
            <input
              .value=${f.location}
              placeholder="예: 7층, 2층 OA실"
              @input=${(e: Event) => this.set("location", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label>
            설명
            <textarea
              rows="2"
              .value=${f.description}
              placeholder="물품 설명이나 주의사항을 적어주세요"
              @input=${(e: Event) =>
                this.set("description", (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>

          <photo-uploader
            multiple
            .entries=${this.stagedUrls.map((u, i) => ({ url: u, key: i }))}
            @upload=${this.onPhotoUpload}
            @remove=${this.onPhotoRemove}
          ></photo-uploader>
        </form>

        <div slot="footer">
          <x-button variant="secondary" size="sm" @click=${this.handleClose}>취소</x-button>
          <x-button
            variant="primary"
            size="sm"
            type="submit"
            ?loading=${this.saving}
            @click=${() => {
              const form = this.shadowRoot?.querySelector("#create-item-form") as HTMLFormElement;
              form?.requestSubmit();
            }}
          >
            저장
          </x-button>
        </div>
      </x-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-create-dialog": ItemCreateDialog;
  }
}
