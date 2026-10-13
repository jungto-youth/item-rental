import { LitElement, html, css, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../api/client";
import { confirmDialog } from "../../utils/confirm";
import { getCategories, resolveCategoryIds } from "../../utils/categories";
import { processPhoto } from "../../utils/photo";
import { navigate } from "../../router";
import { type Item, type ItemKind, type ItemStatus, type Photo } from "../../types";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-page";
import "../../components/ui/button";
import "../../components/ui/chip";
import "../../components/ui/input";
import "../../components/features/category/category-tags-input";
import "../../components/features/item/photo-uploader";

// 물품 등록/편집 — 라우트 /items/new(등록) + /items/:id/edit(수정).
// 편집 초기화는 반드시 관리자 단건 조회로 — 공개 상세엔 태그가 없어 그걸로
// 저장하면 태그가 날아간다(server routes/admin/items.ts 주석).
// 사진은 등록·편집 모두 스테이징 후 저장 시 일괄 반영한다.
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
  // 서버 사진(편집 모드, 표시용) — 삭제는 저장할 때 일괄 반영한다
  @state() private photos: Photo[] = [];
  // 저장 시 삭제할 서버 사진 id (스테이징)
  @state() private removedIds: number[] = [];
  // 새로 올릴 사진(스테이징) — 등록·편집 공통. 저장할 때 일괄 업로드한다
  @state() private staged: File[] = [];
  @state() private stagedUrls: string[] = [];
  // 태그(카테고리) — 이름 배열을 직접 다룬다. id 변환은 저장 시점에 (resolveCategoryIds)
  @state() private tagNames: string[] = [];
  // 태그 자동완성 후보 — 전체 카테고리 (캐시 유틸)
  @state() private categoryOptions: string[] = [];
  @state() private loading = true;
  @state() private loadError = "";
  @state() private saving = false;
  // 사진 축소(리사이즈)는 비동기 — 처리 중 저장을 막고, 사용자가 목록을 비웠을 때
  // 늦게 끝난 결과를 버리기 위해 세대 번호로 세션을 구분한다
  @state() private processingPhotos = false;
  private photoGeneration = 0;
  @state() private error = "";
  // error 의 성격 — 저장은 성공했는데 사진 일부만 실패한 경우처럼 "실패"가 아닌
  // 주의가 필요한 상황을 빨간색과 구분한다
  @state() private errorTone: "error" | "warning" = "error";

  // 로드 세대 — itemId가 빠르게 바뀌면(A→B 전환) 늦게 도착한 A의 응답이 B를 덮어쓰지 않게 한다
  private loadGen = 0;
  // 저장 직후 상태 — 이 값과 달라졌으면 "저장하지 않은 변경"이 있는 것으로 본다
  private baseline = "";

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
        gap: var(--space-5, 24px);
      }

      /* 3 fieldset — 기본 정보 / 분류·상태 / 재고·사진. 한 화면 8블록
         일렬로는 어디가 뭔지 안 보여서 묶는다 */
      fieldset {
        display: flex;
        flex-direction: column;
        gap: var(--space-3-5, 14px);
        margin: 0;
        padding: 0;
        border: none;
        min-width: 0;
      }

      legend {
        padding: 0;
        margin-bottom: var(--space-3, 12px);
        font-size: var(--text-caption, 13px);
        font-weight: 600;
        color: var(--color-muted);
      }

      .hint {
        margin: 0;
        font-size: var(--text-fine, 12px);
        color: var(--color-muted);
      }

      /* 태그 입력은 래퍼 라벨, 칩 필터(구분·상태)는 .field 래퍼 — 칩은 버튼이라
         label 안에 넣으면 label 클릭이 첫 칩으로 튀는 HTML 구조 문제가 있다 */
      label {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        color: var(--color-muted);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        color: var(--color-muted);
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3, 12px);
      }

      @media (max-width: 560px) {
        .row {
          grid-template-columns: 1fr;
        }
      }

      .error-msg {
        color: var(--tone-danger-text, var(--color-danger));
        font-size: var(--text-caption, 13px);
        margin: 0;
      }
      /* 저장은 됐지만 사진 일부가 실패한 경우 — "실패"가 아니므로 경고 톤 */
      .error-msg.warning {
        color: var(--tone-warning-text, var(--color-danger));
      }

      .footer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3, 12px);
        margin-top: var(--space-1, 4px);
      }

      .footer-left {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        min-width: 0;
      }

      .view-link {
        font-size: var(--text-caption, 13px);
        color: var(--color-primary);
        text-decoration: none;
        white-space: nowrap;
      }
      .view-link:hover {
        text-decoration: underline;
      }

      .btn-group {
        display: flex;
        gap: var(--space-2, 8px);
        flex-shrink: 0;
      }
    `,
  ];

  protected updated(changed: PropertyValues) {
    if (changed.has("itemId") && this.itemId) this.init();
  }

  connectedCallback() {
    super.connectedCallback();
    // 탭 닫기·새로고침 등 브라우저 기본 이동에도 같은 보호를 건다
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.clearStaged();
  }

  // ===== 미저장 변경 가드 =====

  // 폼·태그·사진 변경(추가+삭제)을 한 줄로 직렬화해 기준과 비교한다.
  // 태그는 순서까지 비교하지 않는다 — 같은 집합이면 저장 결과가 같다.
  private snapshot(): string {
    return JSON.stringify({
      f: this.form,
      t: [...this.tagNames].sort(),
      p: this.staged.length,
      r: [...this.removedIds].sort(),
    });
  }

  private get dirty(): boolean {
    return this.baseline !== "" && this.snapshot() !== this.baseline;
  }

  // 저장 직후 기준을 갱신 — 이 시점부터의 변경만 "미저장"으로 본다
  private commitBaseline() {
    this.baseline = this.snapshot();
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!this.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  };

  // 취소·삭제 등 이 화면을 떠날 때 — 미저장 변경이 있으면 되묻는다.
  // 사진 추가·삭제도 스테이징이라 저장 전엔 서버에 닿지 않는다.
  private async confirmLeave(): Promise<boolean> {
    if (!this.dirty) return true;
    return await confirmDialog(
      "저장하지 않은 변경이 있어요.\n떠나면 변경 사항이 사라져요.",
      { confirmLabel: "버리고 나가기", cancelLabel: "계속 편집", danger: true },
    );
  }

  private init() {
    const gen = ++this.loadGen;
    this.form = { ...EMPTY_FORM };
    this.tagNames = [];
    this.photos = [];
    this.removedIds = [];
    this.clearStaged();
    this.error = "";
    this.errorTone = "error";
    this.loadError = "";
    this.baseline = "";
    void this.loadCategoryOptions();
    if (this.isCreate) {
      this.loading = false;
      this.commitBaseline();
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
      this.commitBaseline();
    } catch (e) {
      if (gen !== this.loadGen) return;
      this.loading = false;
      this.loadError = e instanceof Error ? e.message : "물품 정보를 불러오지 못했어요";
    }
  }

  private set<K extends keyof ItemFormModel>(k: K, v: ItemFormModel[K]) {
    this.form = { ...this.form, [k]: v };
  }

  // ===== 사진 — 등록·편집 모두 스테이징, 저장할 때 일괄 반영 =====

  // 현재 화면에 보이는 총 장수 (서버 사진 − 삭제 예정 + 새로 추가)
  private get photoCount(): number {
    return this.photos.length - this.removedIds.length + this.staged.length;
  }

  // 업로더 표시용 — 서버 사진(삭제 예정 제외) + 스테이징. 키로 구분한다:
  // 서버 사진은 숫자 id, 스테이징은 "s" + 인덱스.
  private get photoEntries(): { url: string; key: string | number }[] {
    const kept = this.photos
      .filter((p) => !this.removedIds.includes(p.id))
      .map((p) => ({ url: p.url, key: p.id }));
    const fresh = this.stagedUrls.map((u, i) => ({ url: u, key: `s${i}` }));
    return [...kept, ...fresh];
  }

  private async stagePhotos(files: File[]) {
    if (this.processingPhotos || this.saving) return;
    this.processingPhotos = true;
    this.setError("");
    const generation = this.photoGeneration;
    try {
      for (const f of files) {
        if (this.photoCount >= 3) {
          this.setError("사진은 최대 3장까지 등록할 수 있어요");
          break;
        }
        try {
          const processed = await processPhoto(f);
          if (generation !== this.photoGeneration) return;
          this.staged = [...this.staged, processed];
          this.stagedUrls = [...this.stagedUrls, URL.createObjectURL(processed)];
        } catch (err) {
          if (generation !== this.photoGeneration) return;
          this.setError(err instanceof Error ? err.message : "이미지 처리 실패");
        }
      }
    } finally {
      if (generation === this.photoGeneration) this.processingPhotos = false;
    }
  }

  private removeStaged(i: number) {
    URL.revokeObjectURL(this.stagedUrls[i]);
    this.staged = this.staged.filter((_, j) => j !== i);
    this.stagedUrls = this.stagedUrls.filter((_, j) => j !== i);
  }

  private clearStaged() {
    this.photoGeneration++;
    this.processingPhotos = false;
    for (const u of this.stagedUrls) URL.revokeObjectURL(u);
    this.staged = [];
    this.stagedUrls = [];
  }

  private onPhotoUpload(e: CustomEvent<{ files: File[] }>) {
    if (e.detail.files.length === 0) return;
    void this.stagePhotos(e.detail.files);
  }

  private onPhotoRemove(e: CustomEvent<{ key: string | number }>) {
    const key = e.detail.key;
    if (typeof key === "string" && key.startsWith("s")) {
      this.removeStaged(Number(key.slice(1)));
    } else {
      const id = Number(key);
      if (!this.removedIds.includes(id)) this.removedIds = [...this.removedIds, id];
    }
  }

  // 저장 시 사진 일괄 반영 — 실패한 것만 이름 모아 경고로 알린다
  private async flushPhotos(itemId: number | string): Promise<string[]> {
    const failed: string[] = [];
    for (const id of this.removedIds) {
      try {
        await api(`/api/admin/items/${itemId}/photos/${id}`, { method: "DELETE" });
      } catch {
        failed.push("사진 삭제");
      }
    }
    for (const f of this.staged) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        await api(`/api/admin/items/${itemId}/photos`, { method: "POST", body: fd });
      } catch {
        failed.push(f.name);
      }
    }
    this.clearStaged();
    this.removedIds = [];
    return failed;
  }

  // ===== 저장/삭제 =====

  private async handleSave(e: Event) {
    e.preventDefault();
    if (this.saving || this.processingPhotos) return;
    // 자체 검증 — 폼 required 의 무음 차단 대신 명시적 오류 문구를 보여준다
    if (!this.form.name.trim()) {
      this.setError("이름을 입력해주세요");
      return;
    }
    if (!(this.form.total_qty >= 1)) {
      this.setError("보유 수량은 1 이상이어야 해요");
      return;
    }
    // 수리중 수량이 보유 수량을 넘으면 대여 가능 계산이 음수가 된다
    if (this.form.kind === "rental" && this.form.qty_broken > this.form.total_qty) {
      this.setError("수리중 수량은 보유 수량보다 클 수 없어요");
      return;
    }
    this.saving = true;
    this.error = "";
    try {
      // 새 이름은 서버에 먼저 만들고 id 를 붙인다 (없으면 빈 배열 = 태그 없음)
      const category_ids = await resolveCategoryIds(this.tagNames);
      let id: number | string;
      if (this.isCreate) {
        const res = await api<{ id: number }>("/api/admin/items", {
          method: "POST",
          body: JSON.stringify({ ...this.form, category_ids }),
        });
        id = res.id;
      } else {
        await api(`/api/admin/items/${this.itemId}`, {
          method: "PUT",
          body: JSON.stringify({ ...this.form, category_ids }),
        });
        id = this.itemId;
      }
      // 사진 추가·삭제 일괄 반영 — 일부만 실패하면 화면에 남겨 재시도하게 둔다
      const failed = await this.flushPhotos(id);
      if (failed.length > 0) {
        this.error = `물품은 저장됐어요. 사진 처리만 실패했어요: ${failed.join(", ")}`;
        this.errorTone = "warning";
        this.commitBaseline();
        return;
      }
      // 물품 목록으로 복귀 — history.back()은 딥링크·새 탭 진입 시 앱 밖으로
      // 나갈 수 있어 목적지를 고정한다. 목록은 remount 때 재조회되어 최신이 보인다
      this.commitBaseline();
      navigate("/");
    } catch (err) {
      this.setError(
        err instanceof Error
          ? err.message
          : this.isCreate
            ? "물품 등록에 실패했어요"
            : "수정 저장에 실패했어요",
      );
    } finally {
      this.saving = false;
    }
  }

  private async handleDelete() {
    if (!(await confirmDialog(`'${this.form.name}' 물품을 정말 삭제할까요?\n연결된 대여 이력은 남고 복구할 수 없어요.`, { confirmLabel: "삭제" })))
      return;
    try {
      await api(`/api/admin/items/${this.itemId}`, { method: "DELETE" });
      // 삭제된 물품의 이전 화면으로 돌아가면 없는 물품이 된다 — 목록으로 보낸다
      this.baseline = "";
      navigate("/");
    } catch (err) {
      this.setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  // 취소 — 미저장 변경을 확인한 뒤 목록으로 나간다
  private async handleCancel() {
    if (!(await this.confirmLeave())) return;
    this.baseline = "";
    navigate("/");
  }

  // 오류 표시 — 스크린리더가 즉시 읽도록 alert 로 알리고, 포커스를 옮겨
  // 긴 폼 아래쪽에서 제출한 사람이 최상단 오류를 놓치지 않게 한다
  private setError(text: string) {
    this.error = text;
    this.errorTone = "error";
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>(".error-msg")?.focus();
    });
  }

  render() {
    const f = this.form;
    return html`
      <admin-page
        title=${this.isCreate ? "물품 등록" : "물품 수정"}
        ?loading=${this.loading}
        .error=${this.loadError}
        @retry=${() => this.init()}
      >
        <div class="wrap">
          <form @submit=${this.handleSave}>
            ${this.error
              ? html`<p
                  class="error-msg ${this.errorTone}"
                  role=${this.errorTone === "error" ? "alert" : "status"}
                  tabindex="-1"
                >
                  ${this.error}
                </p>`
              : ""}

            <fieldset>
              <legend>기본 정보</legend>
              <x-input
                label="이름 *"
                .value=${f.name}
                @input=${(e: Event) => this.set("name", (e.target as HTMLInputElement).value)}
              ></x-input>

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
            </fieldset>

            <fieldset>
              <legend>분류 · 상태</legend>
              <span class="field">
                카테고리
                <category-tags-input
                  .value=${this.tagNames}
                  .options=${this.categoryOptions}
                  placeholder="태그 입력 후 엔터 (예: 캠핑, 취미)"
                  @change=${(e: CustomEvent<{ value: string[] }>) =>
                    (this.tagNames = e.detail.value)}
                ></category-tags-input>
              </span>

              <div class="row">
                <span class="field">
                  구분
                  <x-chip
                    size="lg"
                    ariaLabel="구분"
                    .value=${f.kind}
                    .options=${[
                      { value: "rental", label: "대여품" },
                      { value: "consumable", label: "소모품" },
                    ]}
                    @change=${(e: CustomEvent<{ value: string }>) =>
                      this.set("kind", e.detail.value as ItemKind)}
                  ></x-chip>
                </span>
                <span class="field">
                  상태
                  <x-chip
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
                  ></x-chip>
                </span>
              </div>
            </fieldset>

            <fieldset>
              <legend>재고 · 사진</legend>
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
              <p class="hint">수리중 수량은 대여 불가 수량이에요 (보유 수량을 넘을 수 없어요)</p>

              <photo-uploader
                multiple
                .disabled=${this.processingPhotos || this.saving}
                .entries=${this.photoEntries}
                @upload=${this.onPhotoUpload}
                @remove=${this.onPhotoRemove}
              ></photo-uploader>
              ${this.processingPhotos ? html`<p role="status">사진을 축소하고 있어요…</p>` : ""}
              <p class="hint">사진 추가·삭제는 저장할 때 함께 반영돼요</p>
            </fieldset>

            <div class="footer-actions">
              <div class="footer-left">
                ${this.isCreate
                  ? ""
                  : html`
                      <x-button variant="danger" size="md" type="button" @click=${this.handleDelete}>
                        물품 삭제
                      </x-button>
                      <a class="view-link" href="/items/${this.itemId}">공개 보기 →</a>
                    `}
              </div>
              <div class="btn-group">
                <x-button variant="secondary" size="md" type="button" @click=${() => void this.handleCancel()}>
                  취소
                </x-button>
                <x-button
                  variant="primary"
                  size="md"
                  type="submit"
                  ?loading=${this.saving}
                  ?disabled=${this.processingPhotos}
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
