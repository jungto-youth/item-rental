import { getCategories } from "../../../utils/categories";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../../../utils/photo";
import { type Category, type ItemKind, type ItemStatus } from "../../../types";
import { resolveCategoryIds } from "../../../utils/category";
import "../../ui/modal";
import "../../ui/button";
import "../../ui/select";
import "../../ui/input";
import "../category/category-tags-input";
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
  // 태그(카테고리) — 이름 배열을 직접 다룬다. id 변환은 저장 시점에 (resolveCategoryIds)
  @state() private tagNames: string[] = [];
  // 칩 에디터의 자동완성 후보 — 다이얼로그가 /api/categories 로 채워서 넘긴다
  @state() private categoryOptions: string[] = [];

  static styles = [
    css`
    :host {
      display: contents;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* 태그 입력·x-select 감싸는 래퍼 라벨 — x-input 은 자체 라벨을 쓴다 */
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--text-caption, 13px);
      font-weight: 600;
      color: var(--color-muted);
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
    `,
  ];

  willUpdate(changed: Map<string, unknown>) {
    // 열 때마다 초기화 — 태그 후보(datalist)는 이 아래에서 /api/categories 로 채운다
    if (changed.has("open") && this.open) {
      this.tagNames = [];
      void this.loadCategoryOptions();
    }
  }

  // 칩 에디터 자동완성 후보 — 기존 카테고리 이름 목록 (없는 경우도 허용)
  private async loadCategoryOptions() {
    try {
      this.categoryOptions = (await getCategories()).map((c) => c.name);
    } catch {
      this.categoryOptions = [];
    }
  }

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
    this.tagNames = [];
    this.error = "";
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };

  private async handleSave(e: Event) {
    e.preventDefault();
    if (this.saving) return;
    // 자체 검증 — 폼 required 의 무음 차단 대신 명시적 오류 문구를 보여준다
    if (!this.form.name.trim()) {
      this.error = "이름을 입력해주세요";
      return;
    }
    if (!(this.form.total_qty >= 1)) {
      this.error = "보유 수량은 1 이상이어야 해요";
      return;
    }
    this.saving = true;
    this.error = "";

    try {
      // 새 이름은 서버에 먼저 만들고 id 를 붙인다 (없으면 빈 배열 = 태그 없음)
      const category_ids = await resolveCategoryIds(this.tagNames);
      const res = await api<{ id: number }>("/api/admin/items", {
        method: "POST",
        body: JSON.stringify({ ...this.form, category_ids }),
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
      this.tagNames = [];
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

          <x-input
            label="이름 *"
            .value=${f.name}
            @input=${(e: Event) => this.set("name", (e.target as HTMLInputElement).value)}
          ></x-input>

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
              <x-select
                size="lg"
                ariaLabel="구분"
                .value=${f.kind}
                .options=${[
        { value: "rental", label: "대여품" },
        { value: "consumable", label: "소모품" },
      ]}
                @change=${(e: CustomEvent<{ value: string }>) =>
        this.set("kind", e.detail.value as ItemKind)}
              ></x-select>
            </label>
            <label>
              상태
              <x-select
                size="lg"
                ariaLabel="상태"
                .value=${f.status}
                .options=${[
        { value: "active", label: "정상" },
        { value: "repair", label: "수리중" },
        { value: "retired", label: "폐기" },
      ]}
                @change=${(e: CustomEvent<{ value: string }>) =>
        this.set("status", e.detail.value as ItemStatus)}
              ></x-select>
            </label>
          </div>

          <div class="row">
            <x-input
              label="보유 수량 *"
              type="number"
              inputmode="numeric"
              min="1"
              .value=${String(f.total_qty)}
              @input=${(e: Event) =>
        this.set("total_qty", Number((e.target as HTMLInputElement).value))}
            ></x-input>
            ${f.kind === "rental"
        ? html`
                  <x-input
                    label="수리중 수량"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    .value=${String(f.qty_broken)}
                    @input=${(e: Event) =>
            this.set("qty_broken", Number((e.target as HTMLInputElement).value))}
                  ></x-input>
                `
        : ""}
          </div>

          <x-input
            label="보관 위치"
            placeholder="예: 7층, 2층 OA실"
            .value=${f.location}
            @input=${(e: Event) => this.set("location", (e.target as HTMLInputElement).value)}
          ></x-input>

          <x-input
            label="설명"
            type="textarea"
            rows="2"
            placeholder="물품 설명이나 주의사항을 적어주세요"
            .value=${f.description}
            @input=${(e: Event) =>
        this.set("description", (e.target as HTMLInputElement).value)}
          ></x-input>

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
