import { LitElement, html, css, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../api/client";
import { confirmDialog } from "../../utils/confirm";
import { getCategories, resolveCategoryIds } from "../../utils/categories";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../../utils/photo";
import { navigate } from "../../router";
import { type Item, type ItemKind, type ItemStatus, type Photo } from "../../types";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-page";
import "../../components/ui/button";
import "../../components/ui/chip-filter";
import "../../components/ui/input";
import "../../components/features/category/category-tags-input";
import "../../components/features/item/photo-uploader";

// 물품 등록/편집 — 팝업 다이얼로그를 통화면으로 뽑아낸 단일 페이지.
// 라우트 /admin/items/:id 하나로 두 모드를 갈라친다(:id === "new" → 등록).
// 편집 초기화는 반드시 관리자 단건 조회로 — 공개 상세엔 태그가 없어 그걸로
// 저장하면 태그가 날아간다(server routes/admin/items.ts 주석).
type ItemFormModel = {
  name: string;
  kind: ItemKind;
  total_qty: number;
  qty_broken: number;
  status: ItemStatus;
  location: string;
  description: string;
};

const EMPTY_FORM: ItemFormModel = {
  name: "",
  kind: "rental",
  total_qty: 1,
  qty_broken: 0,
  status: "active",
  location: "",
  description: "",
};

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

@customElement("page-admin-item-form")
export class PageAdminItemForm extends LitElement {
  @property() itemId = "";

  @state() private form: ItemFormModel = { ...EMPTY_FORM };
  // 편집 모드 — 서버에 반영된 사진(즉시 업로드/삭제)
  @state() private photos: Photo[] = [];
  // 등록 모드 — 물품이 생긴 뒤에 올릴 사진(스테이징)
  @state() private staged: File[] = [];
  @state() private stagedUrls: string[] = [];
  // 태그(카테고리) — 이름 배열을 직접 다룬다. id 변환은 저장 시점에 (resolveCategoryIds)
  @state() private tagNames: string[] = [];
  // 태그 자동완성 후보 — 전체 카테고리 (캐시 유틸)
  @state() private categoryOptions: string[] = [];
  @state() private loading = true;
  @state() private loadError = "";
  @state() private saving = false;
  @state() private error = "";

  // 로드 세대 — itemId가 빠르게 바뀌면(A→B 전환) 늦게 도착한 A의 응답이 B를 덮어쓰지 않게 한다
  private loadGen = 0;

  private get isCreate(): boolean {
    return this.itemId === "new";
  }

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }

      /* 폼이 화면 폭을 다 쓰면 입력줄이 너무 길어진다 — 모달 시절 폭을 유지 */
      .wrap {
        max-width: 560px;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      /* 태그 입력은 래퍼 라벨, 칩 필터(구분·상태)는 .field 래퍼 — 칩은 버튼이라
         label 안에 넣으면 label 클릭이 첫 칩으로 튀는 HTML 구조 문제가 있다 */
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-caption, 13px);
        font-weight: 600;
        color: var(--color-muted);
      }

      .field {
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

      .footer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
      }

      .btn-group {
        display: flex;
        gap: 8px;
      }
    `,
  ];

  protected updated(changed: PropertyValues) {
    if (changed.has("itemId") && this.itemId) this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearStaged();
  }

  private init() {
    const gen = ++this.loadGen;
    this.form = { ...EMPTY_FORM };
    this.tagNames = [];
    this.photos = [];
    this.clearStaged();
    this.error = "";
    this.loadError = "";
    void this.loadCategoryOptions();
    if (this.isCreate) {
      this.loading = false;
      return;
    }
    this.loading = true;
    void this.loadItem(gen);
  }

  private async loadCategoryOptions() {
    try {
      this.categoryOptions = (await getCategories()).map((c) => c.name);
    } catch {
      this.categoryOptions = [];
    }
  }

  private async loadItem(gen: number) {
    try {
      // 폼·태그는 관리자 단건(공개 상세엔 태그가 없다), 사진은 공개 상세가 담당 —
      // 관리자 단건 응답엔 사진이 안 실린다. 사진 조회 실패는 치명적이지 않다(빈 목록 폴백)
      const [detailRes, publicRes] = await Promise.all([
        api<{ item: AdminItemDetail }>(`/api/admin/items/${this.itemId}`),
        api<{ item: Item }>(`/api/items/${this.itemId}`).catch(() => null),
      ]);
      if (gen !== this.loadGen) return;
      const it = detailRes.item;
      this.form = {
        name: it.name,
        kind: it.kind ?? "rental",
        total_qty: it.total_qty ?? 1,
        qty_broken: it.qty_broken ?? 0,
        status: it.status ?? "active",
        location: it.location ?? "",
        description: it.description ?? "",
      };
      this.tagNames = (it.categories ?? []).map((c) => c.name);
      this.photos = publicRes?.item.photos ?? [];
      this.loading = false;
    } catch (e) {
      if (gen !== this.loadGen) return;
      this.loading = false;
      this.loadError = e instanceof Error ? e.message : "물품 정보를 불러오지 못했어요";
    }
  }

  private set<K extends keyof ItemFormModel>(k: K, v: ItemFormModel[K]) {
    this.form = { ...this.form, [k]: v };
  }

  // ===== 사진 — 등록은 스테이징, 편집은 즉시 서버 반영 =====

  private async stagePhotos(files: File[]) {
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

  private async uploadPhoto(file: File) {
    if (!PHOTO_OK.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      this.error = "JPEG/PNG/WebP 5MB 이하 파일만 가능해요";
      return;
    }
    if (this.photos.length >= 3) {
      this.error = "사진은 최대 3장까지 등록할 수 있어요";
      return;
    }
    try {
      const processed = await processPhoto(file);
      const fd = new FormData();
      fd.append("file", processed);
      await api(`/api/admin/items/${this.itemId}/photos`, { method: "POST", body: fd });
      this.photos = await this.fetchPhotos();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "사진 업로드 실패";
    }
  }

  private async deletePhoto(photoId: number) {
    try {
      await api(`/api/admin/items/${this.itemId}/photos/${photoId}`, { method: "DELETE" });
      this.photos = this.photos.filter((x) => x.id !== photoId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "사진 삭제 실패";
    }
  }

  private async fetchPhotos(): Promise<Photo[]> {
    try {
      const res = await api<{ item: Item }>(`/api/items/${this.itemId}`);
      return res.item.photos;
    } catch {
      return this.photos;
    }
  }

  private onPhotoUpload(e: CustomEvent<{ files: File[] }>) {
    const file = e.detail.files[0];
    if (!file) return;
    void (this.isCreate ? this.stagePhotos(e.detail.files) : this.uploadPhoto(file));
  }

  private onPhotoRemove(e: CustomEvent<{ key: string | number }>) {
    void (this.isCreate
      ? Promise.resolve(this.removeStaged(Number(e.detail.key)))
      : this.deletePhoto(Number(e.detail.key)));
  }

  // ===== 저장/삭제 =====

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
      if (this.isCreate) {
        const res = await api<{ id: number }>("/api/admin/items", {
          method: "POST",
          body: JSON.stringify({ ...this.form, category_ids }),
        });
        const failed: string[] = [];
        for (const f of this.staged) {
          const fd = new FormData();
          fd.append("file", f);
          try {
            await api(`/api/admin/items/${res.id}/photos`, { method: "POST", body: fd });
          } catch {
            failed.push(f.name);
          }
        }
        this.clearStaged();
        // 사진 일부가 실패하면 그대로 나가면 알림이 사라진다 — 화면에 남겨 편집으로 재시도하게 둔다
        if (failed.length > 0) {
          this.error = `저장 완료 (사진 업로드 실패: ${failed.join(", ")})`;
          return;
        }
      } else {
        await api(`/api/admin/items/${this.itemId}`, {
          method: "PUT",
          body: JSON.stringify({ ...this.form, category_ids }),
        });
      }
      // 들어온 화면으로 복귀 — 목록은 remount 때 재조회되어 최신이 보인다
      history.back();
    } catch (err) {
      this.error = err instanceof Error
        ? err.message
        : this.isCreate
          ? "물품 등록에 실패했어요"
          : "수정 저장에 실패했어요";
    } finally {
      this.saving = false;
    }
  }

  private async handleDelete() {
    if (!(await confirmDialog(`'${this.form.name}' 물품을 정말 삭제할까요?`, { confirmLabel: "삭제" }))) return;
    try {
      await api(`/api/admin/items/${this.itemId}`, { method: "DELETE" });
      // 삭제된 물품의 이전 화면으로 돌아가면 없는 물품이 된다 — 물품 화면으로 보낸다
      navigate("/");
    } catch (err) {
      this.error = err instanceof Error ? err.message : "삭제 실패";
    }
  }

  render() {
    const f = this.form;
    return html`
      <admin-page
        active="items"
        title=${this.isCreate ? "물품 등록" : "물품 편집"}
        ?loading=${this.loading}
        .error=${this.loadError}
        @retry=${() => this.init()}
      >
        <div class="wrap">
          <form @submit=${this.handleSave}>
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
              <span class="field">
                구분
                <x-chip-filter
                  size="lg"
                  ariaLabel="구분"
                  .value=${f.kind}
                  .options=${[
          { value: "rental", label: "대여품" },
          { value: "consumable", label: "소모품" },
        ]}
                  @change=${(e: CustomEvent<{ value: string }>) =>
          this.set("kind", e.detail.value as ItemKind)}
                ></x-chip-filter>
              </span>
              <span class="field">
                상태
                <x-chip-filter
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
                ></x-chip-filter>
              </span>
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
              placeholder="예: 7층 비품실, 2층 OA실"
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
              ?multiple=${this.isCreate}
              .entries=${this.isCreate
          ? this.stagedUrls.map((u, i) => ({ url: u, key: i }))
          : this.photos.map((p) => ({ url: p.url, key: p.id }))}
              @upload=${this.onPhotoUpload}
              @remove=${this.onPhotoRemove}
            ></photo-uploader>

            <div class="footer-actions">
              ${this.isCreate
          ? html`<span></span>`
          : html`
                    <x-button variant="danger" size="sm" type="button" @click=${this.handleDelete}>
                      물품 삭제
                    </x-button>
                  `}
              <div class="btn-group">
                <x-button variant="secondary" size="sm" type="button" @click=${() => history.back()}>
                  취소
                </x-button>
                <x-button
                  variant="primary"
                  size="sm"
                  type="button"
                  ?loading=${this.saving}
                  @click=${() => this.renderRoot.querySelector("form")?.requestSubmit()}
                >
                  저장
                </x-button>
              </div>
            </div>
          </form>
        </div>
      </admin-page>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-item-form": PageAdminItemForm;
  }
}
