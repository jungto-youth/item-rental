import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/notice";
import "../components/features/item/item-card";
import "../components/features/item/item-create-dialog";

// 탐색(전체 목록) 한 페이지 크기 — 카드 높이 기준 24장이 스크롤 2~3화면 분량
const PAGE_SIZE = 24;

type BrowseResponse = {
  items: Item[];
  total: number;
  available_total: number;
  hasMore: boolean;
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
  @state() private createOpen = false;
  @state() private noticeMsg = "";
  @state() private availableOnly = false;

  private searchTimer = 0;
  // offset은 렌더에 안 쓰이므로 state 아님 — 다음 페이지 시작점은 항상 items.length
  private io: IntersectionObserver | null = null;
  private observedEl: Element | null = null;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
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

      .search {
        width: 100%;
        height: 44px;
        padding: 0 36px 0 14px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        color: var(--color-text);
        box-sizing: border-box;
        font-size: var(--text-body, 15px);
        font-family: inherit;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }

      .search:focus {
        outline: none;
        border-color: var(--color-primary);
        background: var(--color-bg);
      }

      .search::placeholder {
        color: var(--color-muted);
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

      .filter-row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
      }

      .filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 32px;
        padding: 0 12px;
        border-radius: var(--radius-pill, 8px);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s ease;
      }

      .filter-chip:hover {
        border-color: var(--color-muted);
        color: var(--color-text);
      }

      .filter-chip.active {
        border-color: var(--color-primary);
        background: var(--color-primary);
        color: var(--color-primary-text);
      }

      .filter-chip .count {
        font-size: var(--text-fine, 12px);
        opacity: 0.85;
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
    this.searchTimer = window.setTimeout(() => this.fetchItems(), 250);
  }

  private clearSearch() {
    this.q = "";
    this.syncSearchUrl();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.fetchItems();
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

  private handleItemCreated(e: CustomEvent<{ id: number; failedPhotos: string[] }>) {
    this.createOpen = false;
    this.fetchItems();
    if (e.detail.failedPhotos.length > 0) {
      this.noticeMsg = `저장 완료 (사진 업로드 실패: ${e.detail.failedPhotos.join(", ")})`;
    } else {
      navigate(`/items/${e.detail.id}`);
    }
  }

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
            class="search"
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
        ${this.isAdmin
          ? html`
              <x-button variant="primary" size="md" @click=${() => (this.createOpen = true)}>
                + 물품 등록
              </x-button>
            `
          : ""}
      </div>

      <div class="filter-row">
        <button
          type="button"
          class="filter-chip ${!this.availableOnly ? "active" : ""}"
          aria-pressed=${!this.availableOnly}
          @click=${() => this.setAvailableOnly(false)}
        >
          전체 <span class="count">${totalCount}</span>
        </button>
        <button
          type="button"
          class="filter-chip ${this.availableOnly ? "active" : ""}"
          aria-pressed=${this.availableOnly}
          @click=${() => this.setAvailableOnly(true)}
        >
          대여 가능만 <span class="count">${availableCount}</span>
        </button>
      </div>

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
                <div class="grid">
                  ${visibleItems.map((it) => html`<item-card .item=${it}></item-card>`)}
                </div>
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

      <item-create-dialog
        ?open=${this.createOpen}
        @close=${() => (this.createOpen = false)}
        @created=${this.handleItemCreated}
      ></item-create-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-home": PageHome;
  }
}
