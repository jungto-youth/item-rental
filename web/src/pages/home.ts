import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import { type Category, type Item, type ItemKind, type ItemStatus } from "../types";
import { reduceMotion } from "../styles/motion";
import { searchInputCss } from "../styles/controls";
import { rowsCss } from "../components/ui/rows";
import { getCategories } from "../utils/categories";
import "../components/ui/button";
import "../components/ui/chip-filter";
import "../components/ui/empty";
import "../components/ui/notice";
import "../components/features/item/item-card";
import "../components/features/category/category-manage-dialog";

// 물품 화면 — 회원 탐색과 관리자 물품 관리가 한 화면에서 보기 전환으로 갈라친다.
// 카드 보기는 모두 같고(서버 검색·페이지네이션), 목록 보기는 역할이 다르다:
// 회원은 불러온 탐색 결과의 읽기 전용 행, 관리자는 관리자 API 기반 관리 목록
// (폐기 포함·카테고리 필터·수정·등록·카테고리 관리).
const PAGE_SIZE = 24;

type BrowseResponse = {
  items: Item[];
  total: number;
  available_total: number;
  hasMore: boolean;
};

// 관리자 목록 응답 행 — 공개 browse 와 달리 photos[] 대신 thumb_key, 카테고리 객체가 온다
type AdminItem = {
  id: number;
  name: string;
  description: string | null;
  status: ItemStatus;
  total_qty: number;
  qty_broken: number;
  kind: ItemKind;
  location: string | null;
  categories: { id: number; name: string }[];
  thumb_key: string | null;
  photo_count: number;
  reservation_count: number;
};

@customElement("page-home")
export class PageHome extends LitElement {
  @state() private items: Item[] = [];
  @state() private q = "";
  @state() private loading = true;
  @state() private error = "";
  @state() private denied = false;

  // 탐색 모드 서버 카운트 — 배지가 "불러온 만큼"이 아니라 실제 전체를 가리키게 한다
  @state() private total = 0;
  @state() private availTotal = 0;
  @state() private hasMore = false;
  @state() private loadingMore = false;

  @state() private user: SessionUser | null = null;
  @state() private noticeMsg = "";
  @state() private availableOnly = false;

  // 보기 전환 — 카드(기본)/목록. 관리자의 목록 보기가 곧 관리 보기다.
  @state() private view: "card" | "list" = "card";

  // 관리 목록 — 목록 보기에 처음 들어올 때 지연 로드한다 (폐기 포함 전체)
  @state() private adminItems: AdminItem[] = [];
  @state() private adminCats: Category[] = [];
  @state() private adminLoaded = false;
  @state() private adminLoading = false;
  @state() private adminError = "";
  // "all" | "none" | 카테고리 id 문자열
  @state() private categoryFilter = "all";
  @state() private catOpen = false;

  private searchTimer = 0;
  // 마지막으로 서버 검색에 반영된 검색어 — 관리 목록에서 q만 바꾸고 카드 보기로
  // 돌아올 때 재검색이 필요한지 판정하는 기준
  private fetchedQ = "";
  // offset은 렌더에 안 쓰이므로 state 아님 — 다음 페이지 시작점은 항상 items.length
  private io: IntersectionObserver | null = null;
  private observedEl: Element | null = null;

  static styles = [
    reduceMotion,
    searchInputCss,
    rowsCss,
    css`
      :host {
        display: block;
      }

      x-chip-filter {
        margin-bottom: var(--space-4, 16px);
      }

      .top-bar {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }

      .search-box {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
      }

      /* .search — searchInputCss 공용 조형 + 이 화면 전용 오버라이드(높이·클리어 버튼 자리) */
      .search {
        width: 100%;
        height: 44px;
        padding: 0 36px 0 14px;
      }

      .clear-btn {
        position: absolute;
        right: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 50%;
        background: var(--color-border);
        color: var(--color-muted);
        font-size: 11px;
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .clear-btn:hover {
        background: var(--color-muted);
        color: var(--color-bg);
      }

      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--space-4, 16px);
      }

      /* ===== 관리 보기 (관리자의 목록 보기) ===== */
      .manage-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
      }
      .manage-meta {
        margin: 0;
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .manage-actions {
        display: flex;
        gap: var(--space-2, 8px);
      }

      /* 목록 행 — rowsCss 공용 조형 위에 썸네일 배치 */
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }
      .thumb {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        font-size: 18px;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .info {
        flex: 1;
        min-width: 0;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        margin-top: 2px;
      }
      /* 회원 목록 행 — 행 전체가 상세 링크 */
      a.row {
        text-decoration: none;
        color: inherit;
        cursor: pointer;
      }
      a.row:hover {
        background: var(--color-bg);
      }
      .cat {
        color: var(--color-primary);
        font-weight: 600;
      }
      .cat.none {
        color: var(--color-muted);
        font-weight: 400;
      }
      .tag {
        flex-shrink: 0;
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .tag.repair {
        color: var(--tone-warning-text);
      }
      .tag.retired {
        color: var(--color-danger);
      }

      .sentinel {
        height: 1px;
      }

      .more-loading {
        padding: var(--space-4, 16px) 0;
        text-align: center;
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    const p = new URLSearchParams(location.search);
    this.q = p.get("q") ?? ""; // 목록 복귀 시 검색 상태 보존(?q=)
    if (p.get("role") === "denied") {
      this.denied = true;
      history.replaceState(null, "", "/");
    }
    await this.fetchItems();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.io?.disconnect();
    this.observedEl = null;
  }

  // 무한스크롤 문지방 관리 — 문지방이 DOM 에 나타나면 감시 시작, 페이지네이션이
  // 끝나거나(검색 모드·마지막 페이지) 오류 화면이면 감시를 끊는다
  protected updated(changed: PropertyValues) {
    super.updated(changed);
    const sentinel = this.renderRoot.querySelector(".sentinel");
    const active = !this.q && !this.loading && !this.error && this.hasMore;
    if (active && sentinel) {
      if (sentinel !== this.observedEl) {
        this.io?.disconnect();
        this.io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) void this.loadMore();
          },
          // 문지방이 화면 근처에 오기 전에 미리 불러와 스크롤이 끊기지 않게 한다
          { rootMargin: "400px 0px" },
        );
        this.io.observe(sentinel);
        this.observedEl = sentinel;
      }
    } else if (this.observedEl) {
      this.io?.disconnect();
      this.observedEl = null;
    }
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  // 관리 보기 — 관리자의 목록 보기. 회원의 목록 보기와 UI 토글을 공유한다
  private get manageMode(): boolean {
    return this.view === "list" && this.isAdmin;
  }

  // ===== 보기 전환 =====

  private setView(v: "card" | "list") {
    if (this.view === v) return;
    this.view = v;
    if (v === "list") {
      if (this.isAdmin && !this.adminLoaded) void this.loadAdmin();
    } else if (this.q !== this.fetchedQ) {
      // 관리 모드에서 검색어만 바꾼 뒤 돌아온 경우 — 카드 보기는 서버 검색 결과가 필요하다
      void this.fetchItems();
    }
  }

  // ===== 회원 탐색 (카드 보기 + 회원 목록 보기) =====

  // 첫 페이지 로드 — 검색어 있으면 랭킹된 짧은 리스트(페이지 없음), 없으면 탐색 1페이지.
  // 세대 번호로 늦은 응답을 버린다 — 검색어가 빠르게 바뀌면(debounce 끼리) 응답 순서가
  // 뒤집혀 오래된 결과가 새 결과를 덮어쓸 수 있다
  private fetchGen = 0;

  private async fetchItems() {
    const gen = ++this.fetchGen;
    this.loading = true;
    this.error = "";
    try {
      if (this.q) {
        const params = new URLSearchParams({ q: this.q });
        const { items } = await api<{ items: Item[] }>(`/api/items?${params}`);
        if (gen !== this.fetchGen) return;
        this.items = items;
        this.hasMore = false;
      } else {
        const { items, total, available_total, hasMore } = await api<BrowseResponse>(
          `/api/items?${this.browseParams(0)}`,
        );
        if (gen !== this.fetchGen) return;
        this.items = items;
        this.total = total;
        this.availTotal = available_total;
        this.hasMore = hasMore;
      }
      this.fetchedQ = this.q;
    } catch (e) {
      if (gen !== this.fetchGen) return;
      this.error = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      if (gen === this.fetchGen) this.loading = false;
    }
  }

  private browseParams(offset: number): string {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (this.availableOnly) params.set("available", "1");
    return params.toString();
  }

  // 다음 페이지 — 이어 붙이기. 문지방이 여전히 화면 안이면(한 페이지가
  // 뷰포트보다 짧을 때) IntersectionObserver 는 콜백을 다시 부르지 않으므로
  // 여기서 직접 재확인해 계속 불러온다
  private async loadMore() {
    if (this.q || this.loading || this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    try {
      const { items, total, available_total, hasMore } = await api<BrowseResponse>(
        `/api/items?${this.browseParams(this.items.length)}`,
      );
      this.items = [...this.items, ...items];
      this.total = total;
      this.availTotal = available_total;
      this.hasMore = hasMore;
    } catch {
      // 전체를 갈아엎는 error 상태로 바꾸지 않는다 — 이미 그려진 목록을 유지
      this.noticeMsg = "더 불러오지 못했어요 — 스크롤을 움직이면 다시 시도해요";
    } finally {
      this.loadingMore = false;
    }
    const sentinel = this.renderRoot.querySelector(".sentinel");
    if (
      this.hasMore &&
      sentinel &&
      sentinel.getBoundingClientRect().top < window.innerHeight
    ) {
      await this.loadMore();
    }
  }

  // '대여 가능만' 토글 — 탐색 모드에선 서버 필터로 다시 받고, 검색 모드에선
  // 이미 받은 상위 결과에서 클라이언트 필터만 한다
  private setAvailableOnly(v: boolean) {
    if (this.availableOnly === v) return;
    this.availableOnly = v;
    if (!this.q) void this.fetchItems();
  }

  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    this.syncSearchUrl();
    clearTimeout(this.searchTimer);
    // 관리 보기는 받아둔 전체 목록을 클라이언트에서 거른다 — 서버 검색 불필요
    if (!this.manageMode) {
      this.searchTimer = window.setTimeout(() => this.fetchItems(), 250);
    }
  }

  private clearSearch() {
    this.q = "";
    this.syncSearchUrl();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!this.manageMode) this.fetchItems();
  }

  // 검색어를 URL(?q=)에 반영 — 뒤로가기/새로고침/링크 공유 시 검색 상태 복원
  // 입력 중엔 히스토리를 늘리지 않도록 replaceState 사용
  private syncSearchUrl() {
    const p = new URLSearchParams(location.search);
    if (this.q) p.set("q", this.q);
    else p.delete("q");
    const qs = p.toString();
    const target = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (target !== location.pathname + location.search) {
      history.replaceState(null, "", target);
    }
  }

  private isItemAvailable(it: Item): boolean {
    if (it.kind === "consumable") return true;
    if (it.status !== "active") return false;
    const rentable = it.rentable_qty ?? (it.total_qty - (it.qty_broken ?? 0));
    return rentable - (it.active_now ?? 0) > 0;
  }

  // ===== 관리 목록 (관리자의 목록 보기) =====

  private async loadAdmin() {
    this.adminLoading = true;
    this.adminError = "";
    try {
      const [itemsRes, cats] = await Promise.all([
        api<{ items: AdminItem[] }>("/api/admin/items"),
        getCategories(),
      ]);
      this.adminItems = itemsRes.items;
      this.adminCats = cats;
      this.adminLoaded = true;
    } catch (e) {
      this.adminError = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      this.adminLoading = false;
    }
  }

  // 카테고리 칩·검색어로 관리 목록 거르기 — 전체를 한 번에 받아두므로 클라이언트 필터
  private filteredAdmin(): AdminItem[] {
    const q = this.q.trim().toLowerCase();
    return this.adminItems.filter((it) => {
      if (this.categoryFilter === "none") {
        if (it.categories.length > 0) return false;
      } else if (this.categoryFilter !== "all") {
        if (!it.categories.some((c) => String(c.id) === this.categoryFilter)) return false;
      }
      if (!q) return true;
      const names = `${it.name} ${it.location ?? ""} ${it.categories.map((c) => c.name).join(" ")}`;
      return names.toLowerCase().includes(q);
    });
  }

  // ===== 렌더 =====

  render() {
    // 배지 카운트 — 탐색 모드는 서버가 센 실제 전체 수, 검색 모드는 받은 결과 기준
    const totalCount = this.q ? this.items.length : this.total;
    const availableCount = this.q
      ? this.items.filter((it) => this.isItemAvailable(it)).length
      : this.availTotal;
    // 목록 — 탐색 모드는 available 필터를 서버가 이미 적용해 내려주고,
    // 검색 모드는 받은 상위 결과를 클라이언트에서 거른다
    const visibleItems =
      this.q && this.availableOnly
        ? this.items.filter((it) => this.isItemAvailable(it))
        : this.items;

    return html`
      <div class="top-bar">
        <div class="search-box">
          <input
            class="search-input search"
            aria-label="물품 검색"
            placeholder="물품명, 위치, 설명, 카테고리 검색…"
            .value=${this.q}
            @input=${this.onSearch}
          />
          ${this.q
            ? html`
                <button
                  type="button"
                  class="clear-btn"
                  aria-label="검색어 지우기"
                  title="검색어 지우기"
                  @click=${this.clearSearch}
                >
                  ✕
                </button>
              `
            : ""}
        </div>
        <x-button
          variant="secondary"
          size="md"
          @click=${() => this.setView(this.view === "card" ? "list" : "card")}
        >
          ${this.view === "card" ? "목록 보기" : "카드 보기"}
        </x-button>
      </div>

      ${this.manageMode
        ? this.renderManage()
        : html`
            <x-chip-filter
              ariaLabel="물품 필터"
              .value=${this.availableOnly ? "available" : "all"}
              .options=${[
                { value: "all", label: "전체", count: totalCount },
                { value: "available", label: "대여 가능만", count: availableCount },
              ]}
              @change=${(e: CustomEvent<{ value: string }>) =>
                this.setAvailableOnly(e.detail.value === "available")}
            ></x-chip-filter>

            ${this.noticeMsg ? html`<x-notice>${this.noticeMsg}</x-notice>` : ""}
            ${this.denied
              ? html`
                  <x-notice tone="danger" alert>
                    관리자 권한이 필요해요 — 일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
                  </x-notice>
                `
              : ""}

            ${this.error
              ? html`<x-empty state="error" text=${this.error}></x-empty>`
              : this.loading
                ? html`<x-empty state="loading"></x-empty>`
                : visibleItems.length === 0
                  ? html`<x-empty state="empty" text=${this.availableOnly ? "대여 가능한 물품이 없어요" : "검색 결과가 없어요"}></x-empty>`
                  : html`
                      ${this.view === "card"
                        ? html`
                            <div class="grid">
                              ${visibleItems.map((it) => html`<item-card .item=${it}></item-card>`)}
                            </div>
                          `
                        : html`
                            <ul class="rows">
                              ${visibleItems.map((it) => this.renderUserRow(it))}
                            </ul>
                          `}
                      ${!this.q && this.hasMore
                        ? html`
                            ${this.loadingMore
                              ? html`<div class="more-loading" role="status">
                                  불러오는 중…
                                </div>`
                              : ""}
                            <div class="sentinel" aria-hidden="true"></div>
                          `
                        : ""}
                    `}
          `}

      <category-manage-dialog
        ?open=${this.catOpen}
        @close=${() => (this.catOpen = false)}
        @changed=${() => {
          if (this.isAdmin) void this.loadAdmin();
        }}
      ></category-manage-dialog>
    `;
  }

  // 회원 목록 행 — 공개 탐색 데이터만으로 구성. 행 전체가 상세 링크
  // (SPA 링크 가로채기는 Router가 전역으로 처리한다)
  private renderUserRow(it: Item) {
    const photo = it.photos?.[0]?.url;
    return html`
      <li>
        <a class="row" href="/items/${it.id}">
          <div class="thumb">
            ${photo ? html`<img src=${photo} alt="" loading="lazy" />` : "📦"}
          </div>
          <div class="info">
            <div class="name">${it.name}</div>
            <div class="meta">
              ${it.kind === "consumable" ? html`<span>소모품</span>` : ""}
              ${it.location ? html`<span>${it.location}</span>` : ""}
              <span>${this.availabilityLine(it)}</span>
            </div>
          </div>
        </a>
      </li>
    `;
  }

  // 수량 표기 — item-card 배지와 같은 계산 (rentable 기본값 처리 포함)
  private availabilityLine(it: Item): string {
    if (it.kind === "consumable") return `보유 ${it.total_qty}`;
    const rentable = it.rentable_qty ?? (it.total_qty - (it.qty_broken ?? 0));
    const available = Math.max(0, rentable - (it.active_now ?? 0));
    if (it.status === "repair") return "점검·수리 중";
    return available > 0 ? `${available}개 대여 가능` : "대여 중";
  }

  // 관리 보기 — 폐기 포함 전체 목록 + 카테고리 필터 + 등록·수정·카테고리 관리
  private renderManage() {
    const list = this.filteredAdmin();
    return html`
      <div class="manage-head">
        <p class="manage-meta">전체 ${this.adminItems.length}개 · 카테고리 ${this.adminCats.length}개</p>
        <div class="manage-actions">
          <x-button variant="secondary" size="sm" @click=${() => (this.catOpen = true)}>
            카테고리 관리
          </x-button>
          <x-button variant="primary" size="sm" @click=${() => navigate("/admin/items/new")}>
            물품 등록
          </x-button>
        </div>
      </div>

      <x-chip-filter
        ariaLabel="카테고리 필터"
        .value=${this.categoryFilter}
        .options=${[
          { value: "all", label: "카테고리 전체" },
          ...this.adminCats.map((c) => ({
            value: String(c.id),
            label: c.name,
            count: c.item_count,
          })),
          { value: "none", label: "미지정" },
        ]}
        @change=${(e: CustomEvent<{ value: string }>) =>
          (this.categoryFilter = e.detail.value)}
      ></x-chip-filter>

      ${this.adminError
        ? html`
            <x-empty state="error" text=${this.adminError}></x-empty>
            <div class="more-loading">
              <x-button variant="secondary" size="sm" @click=${() => void this.loadAdmin()}>
                다시 시도
              </x-button>
            </div>
          `
        : this.adminLoading
          ? html`<x-empty state="loading"></x-empty>`
          : list.length === 0
            ? html`<x-empty compact state="empty" text="조건에 맞는 물품이 없어요"></x-empty>`
            : html`
                <ul class="rows">
                  ${list.map((it) => this.renderAdminRow(it))}
                </ul>
              `}
    `;
  }

  // 관리 목록 행 — 관리자 응답(thumb_key·categories) 기반. 수정은 편집 페이지로
  private renderAdminRow(it: AdminItem) {
    return html`
      <li class="row">
        <div class="thumb">
          ${it.thumb_key ? html`<img src="/api/photos/${it.thumb_key}" alt="" loading="lazy" />` : "📦"}
        </div>
        <div class="info">
          <div class="name">${it.name}</div>
          <div class="meta">
            ${it.categories.length > 0
        ? it.categories.map((c) => html`<span class="cat">${c.name}</span>`)
        : html`<span class="cat none">미지정</span>`}
            ${it.location ? html`<span>${it.location}</span>` : ""}
            <span>
              보유 ${it.total_qty}${it.qty_broken > 0 ? ` · 수리중 ${it.qty_broken}` : ""}
            </span>
            ${it.kind === "consumable" ? html`<span>소모품</span>` : ""}
          </div>
        </div>
        ${it.status === "repair"
        ? html`<span class="tag repair">점검·수리</span>`
        : it.status === "retired"
          ? html`<span class="tag retired">폐기</span>`
          : ""}
        <x-button variant="secondary" size="sm" @click=${() => navigate(`/admin/items/${it.id}`)}>수정</x-button>
      </li>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
