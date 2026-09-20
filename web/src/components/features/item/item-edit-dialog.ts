import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../../../utils/photo";
import { type Category, type Item, type ItemKind, type ItemStatus, type Photo } from "../../../types";
import { resolveCategoryIds } from "../../../utils/category";
import { selectCss } from "../../../styles/controls";
import "../../ui/modal";
import "../../ui/button";
import "../category/category-tags-input";
import "./photo-uploader";

// 관리자 단건 조회 응답 — 공개 Item 과 달리 태그 이름 배열이 함께 온다 (server items.service)
type AdminItemDetail = {
  id: number;
  name: string;
  kind?: ItemKind;
  total_qty?: number;
  qty_broken?: number;
  status?: ItemStatus;
  location?: string | null;
  description?: string | null;
  categories?: { id: number; name: string }[];
};

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
    description: "",
  };

  @state() private photos: Photo[] = [];
  // 태그(카테고리) — 이름 배열을 직접 다룬다. id 변환은 저장 시점에 (resolveCategoryIds)
  @state() private tagNames: string[] = [];
  // 칩 에디터의 자동완성 후보 — initForm 이 단건 조회(태그)로 채운다
  @state() private categoryOptions: string[] = [];
  @state() private saving = false;
  @state() private error = "";

  static styles = [
    selectCss,
    css`
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

    input, textarea {
      padding: 0 12px;
      height: 44px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--text-body, 15px);
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }

    select {
      height: 44px; /* 폼 입력과 높이 맞춤 — 나머지는 selectCss가 담당 */
    }

    textarea {
      height: auto;
      padding: 10px 12px;
      resize: vertical;
    }

    input:focus, textarea:focus {
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
    `,
  ];

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open && this.item) this.initForm();
  }

  private async initForm() {
    this.photos = this.item.photos ?? [];
    this.error = "";
    this.tagNames = [];
    // note 조회를 위해 단건 조회
    try {
      const res = await api<{ item: AdminItemDetail }>(`/api/admin/items/${this.item.id}`);
      const it = res.item;
      this.editForm = {
        name: it.name ?? this.item.name,
        kind: it.kind ?? this.item.kind ?? "rental",
        total_qty: it.total_qty ?? this.item.total_qty,
        qty_broken: it.qty_broken ?? this.item.qty_broken ?? 0,
        status: it.status ?? this.item.status,
        location: it.location ?? this.item.location ?? "",
        description: it.description ?? this.item.description ?? "",
      };
      this.tagNames = (it.categories ?? []).map((c) => c.name);
      this.categoryOptions = it.categories?.map((c) => c.name) ?? [];
    } catch {
      // 실패 시 기존 객체로 폴백 — 태그 이름은 목록 재조회로 채운다
      this.editForm = {
        name: this.item.name,
        kind: this.item.kind ?? "rental",
        total_qty: this.item.total_qty,
        qty_broken: this.item.qty_broken ?? 0,
        status: this.item.status,
        location: this.item.location ?? "",
        description: this.item.description ?? "",
      };
      void this.resolveTagNames(this.item.category_ids ?? []);
    }
  }

  // id 목록 → 이름 목록 — 실패 시 태그가 사라지는 것보다 목록 재조회가 낫다(+결과 없으면 빈 값)
  private async resolveTagNames(categoryIds: number[]) {
    if (categoryIds.length === 0) {
      this.tagNames = [];
      return;
    }
    try {
      const res = await api<{ categories: Category[] }>("/api/categories");
      this.categoryOptions = res.categories.map((c) => c.name);
      this.tagNames = categoryIds
        .map((id) => res.categories.find((c) => c.id === id))
        .flatMap((c) => (c ? [c.name] : []));
    } catch {
      this.tagNames = [];
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
      // 새 이름은 서버에 먼저 만들고 id 를 붙인다 (없으면 빈 배열 = 태그 없음)
      const category_ids = await resolveCategoryIds(this.tagNames);
      await api(`/api/admin/items/${this.item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...this.editForm, category_ids }),
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

  private async onPhotoUpload(e: CustomEvent<{ files: File[] }>) {
    if (!this.item) return;
    const file = e.detail.files[0];
    if (!file) return;

    if (!PHOTO_OK.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      this.error = "JPEG/PNG/WebP, 5MB 이하만 가능합니다.";
      return;
    }
    if (this.photos.length >= 3) {
      this.error = "사진은 최대 3장까지 등록할 수 있습니다.";
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
    }
  }

  private async onPhotoRemove(e: CustomEvent<{ key: string | number }>) {
    const p = this.photos.find((x) => x.id === e.detail.key);
    if (p) await this.handleDeletePhoto(p);
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

          <label>
            카테고리
            <category-tags-input
              .value=${this.tagNames}
              .options=${this.categoryOptions}
              placeholder="태그 입력 후 엔터 (예: 캠핑, 취미)"
              @change=${(e: CustomEvent<{ value: string[] }>) =>
                (this.tagNames = e.detail.value)}
            ></category-tags-input>
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
              placeholder="예: 7층 비품실"
              @input=${(e: Event) => this.set("location", (e.target as HTMLInputElement).value)}
            />
          </label>

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

          <photo-uploader
            .entries=${this.photos.map((p) => ({ url: p.url, key: p.id }))}
            @upload=${this.onPhotoUpload}
            @remove=${this.onPhotoRemove}
          ></photo-uploader>
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
