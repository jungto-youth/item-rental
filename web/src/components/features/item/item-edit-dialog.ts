import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../../../utils/photo";
import { type Item, type ItemKind, type ItemStatus, type Photo } from "../../../types";
import "../../ui/modal";
import "../../ui/button";

@customElement("item-edit-dialog")
export class ItemEditDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) item!: Item;

  @state() private editForm = {
    name: "",
    kind: "rental" as ItemKind,
    total_qty: 1,
    qty_broken: 0,
    status: "active" as ItemStatus,
    location: "",
    size: "",
    color: "",
    note: "",
    description: "",
  };

  @state() private photos: Photo[] = [];
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

    .photos-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
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
      color: #fff;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }

    .error-msg {
      color: var(--color-danger);
      font-size: var(--text-caption, 13px);
      margin: 0;
    }

    .footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .btn-group {
      display: flex;
      gap: 8px;
    }
  `;

  async willUpdate(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open && this.item) {
      this.initForm();
    }
  }

  private async initForm() {
    this.photos = this.item.photos ?? [];
    this.error = "";
    // note 조회를 위해 단건 조회
    try {
      const res = await api<{ item: Partial<Item> }>(`/api/admin/items/${this.item.id}`);
      const it = res.item;
      this.editForm = {
        name: it.name ?? this.item.name,
        kind: it.kind ?? this.item.kind ?? "rental",
        total_qty: it.total_qty ?? this.item.total_qty,
        qty_broken: it.qty_broken ?? this.item.qty_broken ?? 0,
        status: it.status ?? this.item.status,
        location: it.location ?? this.item.location ?? "",
        size: it.size ?? this.item.size ?? "",
        color: it.color ?? this.item.color ?? "",
        note: it.note ?? this.item.note ?? "",
        description: it.description ?? this.item.description ?? "",
      };
    } catch {
      // 실패 시 기존 객체로 폴백
      this.editForm = {
        name: this.item.name,
        kind: this.item.kind ?? "rental",
        total_qty: this.item.total_qty,
        qty_broken: this.item.qty_broken ?? 0,
        status: this.item.status,
        location: this.item.location ?? "",
        size: this.item.size ?? "",
        color: this.item.color ?? "",
        note: this.item.note ?? "",
        description: this.item.description ?? "",
      };
    }
  }

  private set<K extends keyof typeof this.editForm>(k: K, v: (typeof this.editForm)[K]) {
    this.editForm = { ...this.editForm, [k]: v };
  }

  private handleClose = () => {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };

  private async handleSave(e: Event) {
    e.preventDefault();
    if (this.saving || !this.item) return;
    this.saving = true;
    this.error = "";

    try {
      await api(`/api/admin/items/${this.item.id}`, {
        method: "PUT",
        body: JSON.stringify(this.editForm),
      });

      this.dispatchEvent(new CustomEvent("saved", { bubbles: true, composed: true }));
      this.handleClose();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "수정 저장에 실패했습니다.";
    } finally {
      this.saving = false;
    }
  }

  private async handleDeleteItem() {
    if (!this.item) return;
    if (!confirm(`'${this.item.name}' 물품을 정말 삭제하시겠습니까?`)) return;

    try {
      await api(`/api/admin/items/${this.item.id}`, { method: "DELETE" });
      this.dispatchEvent(new CustomEvent("deleted", { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "삭제 실패";
    }
  }

  private async handleUploadPhoto(e: Event) {
    if (!this.item) return;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!PHOTO_OK.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      this.error = "JPEG/PNG/WebP, 5MB 이하만 가능합니다.";
      input.value = "";
      return;
    }
    if (this.photos.length >= 3) {
      this.error = "사진은 최대 3장까지 등록할 수 있습니다.";
      input.value = "";
      return;
    }

    try {
      const processed = await processPhoto(file);
      const fd = new FormData();
      fd.append("file", processed);
      await api(`/api/admin/items/${this.item.id}/photos`, {
        method: "POST",
        body: fd,
      });

      // 사진 목록 갱신
      const res = await api<{ item: Item }>(`/api/items/${this.item.id}`);
      this.photos = res.item.photos;
      this.dispatchEvent(new CustomEvent("photo-changed", { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "사진 업로드 실패";
    } finally {
      input.value = "";
    }
  }

  private async handleDeletePhoto(p: Photo) {
    if (!this.item) return;
    try {
      await api(`/api/admin/items/${this.item.id}/photos/${p.id}`, { method: "DELETE" });
      this.photos = this.photos.filter((x) => x.id !== p.id);
      this.dispatchEvent(new CustomEvent("photo-changed", { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "사진 삭제 실패";
    }
  }

  render() {
    const f = this.editForm;

    return html`
      <x-modal ?open=${this.open} title="물품 편집" maxWidth="540px" @close=${this.handleClose}>
        <form id="edit-item-form" @submit=${this.handleSave}>
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

          <div class="row">
            <label>
              보관 위치
              <input
                .value=${f.location}
                placeholder="예: 7층 비품실"
                @input=${(e: Event) => this.set("location", (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              규격 / 크기
              <input
                .value=${f.size}
                placeholder="예: 50x30cm"
                @input=${(e: Event) => this.set("size", (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>

          <div class="row">
            <label>
              색상
              <input
                .value=${f.color}
                placeholder="예: 블랙"
                @input=${(e: Event) => this.set("color", (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              내부 관리 메모 (관리자 전용)
              <input
                .value=${f.note}
                placeholder="구입처, 시리얼넘버 등"
                @input=${(e: Event) => this.set("note", (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>

          <label>
            설명
            <textarea
              rows="2"
              .value=${f.description}
              placeholder="물품 설명"
              @input=${(e: Event) =>
                this.set("description", (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>

          <div class="photos-box">
            <label>
              사진 관리 (${this.photos.length}/3)
              ${this.photos.length < 3
                ? html`
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      @change=${this.handleUploadPhoto}
                    />
                  `
                : ""}
            </label>
            <div class="pics">
              ${this.photos.map(
                (p) => html`
                  <div class="pic">
                    <img src=${p.url} alt="" />
                    <button
                      type="button"
                      class="pic-del"
                      title="삭제"
                      @click=${() => this.handleDeletePhoto(p)}
                    >
                      ×
                    </button>
                  </div>
                `,
              )}
            </div>
          </div>
        </form>

        <div slot="footer" class="footer-actions">
          <x-button variant="danger" size="sm" @click=${this.handleDeleteItem}>물품 삭제</x-button>
          <div class="btn-group">
            <x-button variant="secondary" size="sm" @click=${this.handleClose}>취소</x-button>
            <x-button
              variant="primary"
              size="sm"
              type="submit"
              ?loading=${this.saving}
              @click=${() => {
                const form = this.shadowRoot?.querySelector("#edit-item-form") as HTMLFormElement;
                form?.requestSubmit();
              }}
            >
              저장
            </x-button>
          </div>
        </div>
      </x-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-edit-dialog": ItemEditDialog;
  }
}
