import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import "../components/ui/badge";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../utils/photo";
import { type Item, type ItemKind, type ItemStatus } from "../types";
import { reduceMotion } from "../styles/motion";

// 등록 폼 기본값 — 상태 초기화와 openCreate()가 같은 객체를 쓰게 해 필드 추가 시
// 한 곳만 고치면 되도록 한다 (위치 칸이 두 곳에 따로 있어 한쪽이 빠졌던 문제)
const EMPTY_FORM = {
  name: "",
  kind: "rental" as ItemKind,
  total_qty: 1,
  qty_broken: 0,
  status: "active" as ItemStatus,
  description: "",
  location: "",
};

// SPEC §5 — 물품 목록: 검색(키워드+의미) + 가용 배지.
// 카테고리 없음(migration 0011) — 92건은 검색으로 좁힌다.
// 위치는 상세(item-detail.ts)에만 표시 — 70건이 전부 '정토회관' 단일 값이라 카드에서는 잡음이다 (v3.0)
// 운영진(admin)은 여기서 바로 물품을 등록 — 등록 전용 화면 없음 (DESIGN 통합안)
@customElement("page-home")
export class PageHome extends LitElement {
  @state()
  private items: Item[] = [];
  @state()
  private q = "";
  @state()
  private loading = true;
  @state()
  private error = "";
  // /?role=denied 로 튕겨져 온 경우의 1회성 안내 (관리자 권한 없이 /admin 진입 시, §6)
  @state()
  private denied = false;

  // 등록 폼 (운영진 전용)
  @state()
  private user: SessionUser | null = null;
  @state()
  private creating = false;
  @state()
  private form = { ...EMPTY_FORM };
  @state()
  private staged: File[] = [];
  @state()
  private stagedUrls: string[] = [];
  @state()
  private saving = false;
  @state()
  private createMsg = "";

  static styles = [
    reduceMotion,
    css`
      .top {
        display: grid;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }
      .search {
        flex: 1;
        min-width: 0;
        height: 44px;
        padding: 0 var(--space-5);
        border: 1px solid var(--color-border);
        border-radius: var(
          --radius-pill
        ); /* DESIGN.md §5 — 검색창도 CTA 문법(풀필) */
        background: var(--color-surface);
        color: var(--color-text);
        box-sizing: border-box;
        font-size: 1rem; /* iOS 줌 방지 최소치 */
        font-family: inherit;
      }
      .search:focus {
        outline: none;
        border-color: var(--color-primary);
      }
      .search::placeholder {
        color: var(--color-muted);
      }
      .btn-add {
        justify-self: start; /* 풀폭 대신 내용 크기 — 저빈도 보조 액션의 존재감 낮춤 */
        height: 44px;
        padding: 0 var(--space-4);
        border-radius: var(--radius-pill);
        background: transparent;
        border: 1px solid var(--color-primary);
        color: var(--color-primary);
        font: inherit;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .btn-add:active {
        transform: scale(0.95);
      }
      /* 보관 위치는 카드에 넣지 않는다 — 현재 시트 값이 전부 '정토회관' 한 값뿐이라
      카드마다 같은 글자만 반복되고 물품명 가독성만 떨어진다.
      선반 단위 위치가 채워지면 그때 카드에 올린다. 상세·편집에는 있다. */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: var(--space-3);
      }
      .card {
        display: block;
        text-decoration: none;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .thumb {
        aspect-ratio: 4 / 3;
        background: var(--color-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-muted);
        font-size: 1.6rem;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .meta {
        padding: var(--space-3) var(--space-4);
      }
      .name {
        font-weight: 600;
        font-size: var(--text-body);
        letter-spacing: var(--tracking-tight);
        margin-bottom: var(--space-2);
      }
      /* 수량이 1개뿐인 물품은 숫자를 반복해도 정보가 없다 — 2개 이상만 보여준다 */
      .qty {
        font-size: var(--text-fine);
        color: var(--color-muted);
        margin-bottom: var(--space-2);
      }
      .empty,
      .error {
        color: var(--color-muted);
        padding: var(--space-6) 0;
        text-align: center;
        font-size: var(--text-caption);
      }
      .error {
        color: var(--color-danger);
      }

      /* --- 등록 폼 (운영진) --- */
      .create-form {
        display: grid;
        gap: var(--space-3);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-5);
        margin-bottom: var(--space-4);
      }
      .create-form h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      .create-form label {
        font-size: var(--text-caption);
        color: var(--color-muted);
        display: grid;
        gap: 4px;
      }
      .create-form input,
      .create-form select,
      .create-form textarea {
        height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 1rem;
        font-family: inherit;
        box-sizing: border-box;
      }
      .create-form textarea {
        height: auto;
        min-height: 72px;
        padding: var(--space-3);
      }
      .create-form input:focus,
      .create-form select:focus,
      .create-form textarea:focus {
        outline: none;
        border-color: var(--color-primary);
      }
      .row {
        display: flex;
        gap: var(--space-3);
      }
      .row > label {
        flex: 1;
      }
      .pics {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .pic {
        position: relative;
        width: 72px;
        height: 72px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        border: 1px solid var(--color-border);
      }
      .pic img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      /* DESIGN.md §5 — 사진 위 원형 컨트롤 칩 (Apple icon-circular) */
      .pic button {
        position: absolute;
        top: 2px;
        right: 2px;
        background: rgba(210, 210, 215, 0.64);
        color: #1d1d1f;
        border: 0;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        cursor: pointer;
        line-height: 1;
        font-size: 0.7rem;
      }
      .form-actions {
        display: flex;
        gap: var(--space-2);
      }
      .btn-ghost {
        height: 44px;
        padding: 0 var(--space-4);
        border-radius: var(--radius-pill);
        background: transparent;
        border: 1px solid var(--color-primary);
        color: var(--color-primary);
        font: inherit;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .btn-ghost:active {
        transform: scale(0.95);
      }
      .msg {
        color: var(--color-danger);
        font-size: var(--text-caption);
        margin: 0;
        min-height: 1.2em;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    const p = new URLSearchParams(location.search);
    if (p.get("role") === "denied") {
      this.denied = true;
      history.replaceState(null, "", "/"); // 배너 노출 후 URL 정리
    }
    await this.fetchItems();
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  private async fetchItems() {
    this.loading = true;
    this.error = "";
    try {
      const params = new URLSearchParams();
      if (this.q) params.set("q", this.q);
      const { items } = await api<{ items: Item[] }>(`/api/items?${params}`);
      this.items = items;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "오류";
    } finally {
      this.loading = false;
    }
  }

  private searchTimer = 0;
  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.fetchItems(), 300);
  }

  // 카드 <a href>가 전체 리로드를 유발 — SPA 전환으로 변경(§6). ctrl/cmd+클릭은 기본동작 유지
  private onCardClick(e: Event, id: number) {
    if (e.defaultPrevented) return;
    if (
      (e as MouseEvent).metaKey ||
      (e as MouseEvent).ctrlKey ||
      (e as MouseEvent).button !== 0
    )
      return;
    e.preventDefault();
    navigate(`/items/${id}`);
  }

  // 사진 404(R2 부재·네트워크 오류) 시 플레이스홀더로 대체 — 콘솔 에러는 브라우저가 남기지만 UI는 깨끗하게 유지
  private onImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    const thumb = img.parentElement;
    img.remove();
    if (thumb) thumb.textContent = "📦";
  }

  // --- 등록 폼 (운영진) ---
  private openCreate() {
    this.creating = true;
    this.createMsg = "";
    this.clearStaged();
    this.form = { ...EMPTY_FORM };
  }

  private closeCreate() {
    this.creating = false;
    this.clearStaged();
  }

  private clearStaged() {
    this.stagedUrls.forEach((u) => URL.revokeObjectURL(u));
    this.staged = [];
    this.stagedUrls = [];
  }

  private async pickStaged(e: Event) {
    const input = e.target as HTMLInputElement;
    for (const f of Array.from(input.files ?? [])) {
      if (this.staged.length >= 3) {
        this.createMsg = "사진은 최대 3장이에요";
        break;
      }
      if (!PHOTO_OK.includes(f.type) || f.size > MAX_PHOTO_BYTES) {
        this.createMsg = "JPEG/PNG/WebP, 5MB 이하만 가능해요";
        continue;
      }
      try {
        // 업로드 전 브라우저에서 리사이즈(1600px·WebP) — 변환본만 저장 (§4.2)
        const processed = await processPhoto(f);
        this.staged = [...this.staged, processed];
        this.stagedUrls = [...this.stagedUrls, URL.createObjectURL(processed)];
      } catch (err) {
        this.createMsg =
          err instanceof Error ? err.message : "이미지 처리 실패";
      }
    }
    input.value = "";
  }

  private removeStaged(i: number) {
    URL.revokeObjectURL(this.stagedUrls[i]);
    this.staged = this.staged.filter((_, j) => j !== i);
    this.stagedUrls = this.stagedUrls.filter((_, j) => j !== i);
  }

  private set<K extends keyof typeof this.form>(
    k: K,
    v: (typeof this.form)[K],
  ) {
    this.form = { ...this.form, [k]: v };
  }

  private async save() {
    if (this.saving) return; // 진행 중 재클릭 → 물품 중복 등록 방지
    this.saving = true;
    this.createMsg = "";
    try {
      const res = await api<{ id: number }>("/api/admin/items", {
        method: "POST",
        body: JSON.stringify(this.form),
      });
      // 등록 모드에서 고른 사진 — id 발급 직후 업로드 (사진 API는 물품 id 기반)
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
      this.closeCreate();
      await this.fetchItems();
      if (failed.length) {
        this.createMsg = `저장했어요 — 사진 업로드 실패(상세에서 다시 올려주세요): ${failed.join(
          ", ",
        )}`;
      } else {
        navigate(`/items/${res.id}`); // 등록한 물품으로 바로 이동 — 1회 클릭 저장 완료
      }
    } catch (e) {
      this.createMsg = e instanceof Error ? e.message : "저장 실패";
    } finally {
      this.saving = false;
    }
  }

  // SPA 이동은 언로드가 아니다 — 파괴 시점에 직접 정리해야 한다 (history.ts의 clearTimeout과 같은 이유)
  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearStaged(); // stagedUrls의 revokeObjectURL 포함 여부 확인
    if (this.searchTimer !== null) clearTimeout(this.searchTimer); // 죽은 컴포넌트로 fetch 방지
  }

  render() {
    return html`
      ${this.creating ? this.renderCreate() : ""}
      <div class="top">
        ${
          this.isAdmin
            ? html`<button class="btn-add" @click=${this.openCreate}>
                + 물품 등록
              </button>`
            : ""
        }
        <input
          class="search"
          placeholder="이름·설명·위치로 검색해 보세요"
          .value=${this.q}
          @input=${this.onSearch}
        />
      </div>
      ${this.createMsg ? html`<p class="msg">${this.createMsg}</p>` : ""}
      ${
        this.denied
          ? html`<p class="msg" role="alert">
              관리자 권한이 필요해요 — 회원(사용자) 계정으로는 관리자 화면에
              들어갈 수 없어요.
            </p>`
          : ""
      }
      ${
        this.error
          ? html`<p class="error">${this.error}</p>`
          : this.loading
            ? html`<p class="empty">불러오는 중…</p>`
            : this.items.length === 0
              ? html`<p class="empty">물품이 없어요</p>`
              : html`
                  <div class="grid">
                    ${this.items.map(
                      (it) => html`
                        <a
                          class="card"
                          href="/items/${it.id}"
                          @click=${(e: Event) => this.onCardClick(e, it.id)}
                        >
                          <div class="thumb">
                            ${
                      it.photos[0]
                        ? html`<img
                            src=${it.photos[0].url}
                            alt=${it.name}
                            loading="lazy"
                            @error=${this.onImgError}
                          />`
                        : "📦"
                    }
                          </div>
                          <div class="meta">
                            <div class="name">${it.name}</div>
                            ${
                      it.kind !== "consumable" && (it.rentable_qty ?? 0) > 1
                        ? html`<div class="qty">
                            대여 가능
                            ${Math.max(
                                0,
                                (it.rentable_qty ?? 0) - (it.active_now ?? 0),
                              )}
                            / ${it.rentable_qty}개
                          </div>`
                        : ""
                    }
                            ${
                      it.availability_badge
                        ? html`<x-badge
                            kind=${it.availability_badge}
                          ></x-badge>`
                        : ""
                    }
                          </div>
                        </a>
                      `,
                    )}
                  </div>
                `
      }
    `;
  }

  private renderCreate() {
    const f = this.form;
    return html`
      <form
        class="create-form"
        @submit=${(e: Event) => {
          e.preventDefault();
          this.save();
        }}
      >
        <h2>물품 등록</h2>
        <label
          >이름
          <input
            required
            .value=${f.name}
            @input=${(e: Event) =>
              this.set("name", (e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="row">
          <label
            >구분
            <select
              .value=${f.kind}
              @change=${(e: Event) =>
                this.set(
                  "kind",
                  (e.target as HTMLSelectElement).value as ItemKind,
                )}
            >
              <option value="rental" ?selected=${f.kind === "rental"}>
                대여품
              </option>
              <option value="consumable" ?selected=${f.kind === "consumable"}>
                소모품
              </option>
            </select>
          </label>
          <label
            >상태
            <select
              .value=${f.status}
              @change=${(e: Event) =>
                this.set(
                  "status",
                  (e.target as HTMLSelectElement).value as ItemStatus,
                )}
            >
              <option value="active" ?selected=${f.status === "active"}>
                정상
              </option>
              <option value="repair" ?selected=${f.status === "repair"}>
                수리중
              </option>
              <option value="retired" ?selected=${f.status === "retired"}>
                폐기
              </option>
            </select>
          </label>
        </div>
        <div class="row">
          <label
            >보유 수량
            <input
              type="number"
              min="1"
              .value=${String(f.total_qty)}
              @input=${(e: Event) =>
                this.set(
                  "total_qty",
                  Number((e.target as HTMLInputElement).value),
                )}
            />
          </label>
          ${
            f.kind === "rental"
              ? html`
                  <label
                    >수리중 수량
                    <input
                      type="number"
                      min="0"
                      .value=${String(f.qty_broken)}
                      @input=${(e: Event) =>
                        this.set(
                          "qty_broken",
                          Number((e.target as HTMLInputElement).value),
                        )}
                    />
                  </label>
                `
              : ""
          }
        </div>
        <label
          >보관 위치
          <input
            .value=${f.location}
            placeholder="예: 7층, 2층 OA실"
            @input=${(e: Event) =>
              this.set("location", (e.target as HTMLInputElement).value)}
          />
        </label>
        <label
          >설명
          <textarea
            rows="3"
            .value=${f.description}
            @input=${(e: Event) =>
              this.set("description", (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
        <label
          >사진 (최대 3장 · JPEG/PNG/WebP · 5MB)
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            @change=${this.pickStaged}
          />
        </label>
        <div class="pics">
          ${this.stagedUrls.map(
            (u, i) => html`
              <div class="pic">
                <img src=${u} alt="" />
                <button
                  type="button"
                  title="삭제"
                  @click=${() => this.removeStaged(i)}
                >
                  ×
                </button>
              </div>
            `,
          )}
        </div>
        <div class="form-actions">
          <button type="button" class="btn-ghost" @click=${this.closeCreate}>
            취소
          </button>
          <button class="btn-add" type="submit" ?disabled=${this.saving}>
            ${this.saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
