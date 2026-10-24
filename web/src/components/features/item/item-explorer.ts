import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { session } from "../../../context/session";
import { type CatalogSummary, type Item } from "../../../types";
import { reduceMotion } from "../../../styles/motion";
import { availableQty, catalogSummary } from "../../../utils/stock";
import "../../ui/button";
import "../../ui/empty";
import "../../ui/notice";
import "./item-list-row";

// 물품 현황 목록 — .pen 의 데스크탑 표와 모바일 3줄 카드를 한 컴포넌트로 그린다.
// 관리자와 회원이 같은 행 모양을 쓰고, 행 목적지만 다르다(수정 폼 / 상세).
// 요약·탭·목록의 숫자 규칙은 이슈 #12 §6.2·§6.4 를 따른다:
//   - 요약(총 종류·보유·대여 중·대여 가능)은 수량 합계다. 폐기는 어느 값에도 넣지 않는다.
//   - 탭(전체·대여 중·대여 가능)은 같은 합계를 라벨로 쓴다. 행 수와 다를 수 있다.
//   - 상태 칸은 shared/stock.statusParts 가 만든다 — 수량 0 인 항은 구분점까지 숨긴다.
type TabKey = "all" | "rented" | "available";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "rented", label: "대여 중" },
  { key: "available", label: "대여 가능" },
];


// 목록은 한 번에 10건씩 — 회원은 서버 페이지, 관리자는 전체를 받아 두고 10건씩 펼친다.
// '더보기'를 누를 때마다 같은 수만큼 더 보여준다 (.pen 물품 현황 / (M)).
const PAGE_SIZE = 10;

type BrowseResponse = {
  items: Item[];
  total: number;
  available_total: number;
  matched: number;
  summary: CatalogSummary;
  hasMore: boolean;
};

type AdminListResponse = {
  items: Item[];
  total: number;
  hasMore: boolean;
};

@customElement("item-explorer")
export class ItemExplorer extends LitElement {
  @property() q = "";

  @state() private isAdmin = false;

  // ===== 회원 모드 =====
  @state() private items: Item[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private summary: CatalogSummary | null = null;
  @state() private hasMore = false;
  @state() private loadingMore = false;
  @state() private noticeMsg = "";

  // ===== 관리자 모드 =====
  @state() private adminItems: Item[] = [];
  @state() private adminLoading = false;
  @state() private adminError = "";
  @state() private truncated = false;
  @state() private shown = PAGE_SIZE;

  @state() private tab: TabKey = "all";

  private unsub: (() => void) | null = null;
  // 세대 번호로 늦은 응답을 버린다
  private fetchGen = 0;
  private adminGen = 0;
  private searchTimer = 0;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      /* ===== 요약은 page-home 이 소유한다 (요약 → 검색 → 탭 순서를 화면별로 맞추기 위해) ===== */

      /* ===== 탭 ===== */
      .tabs {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) 0;
      }
      .tab {
        padding: var(--space-1, 4px) 0;
        border: none;
        background: none;
        font-family: inherit;
        font-size: 1rem;
        color: var(--color-ink-3, #9c9c9c);
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.15s ease;
      }
      .tab:hover {
        color: var(--color-text);
      }
      .tab[aria-pressed="true"] {
        color: var(--color-text);
        font-weight: 700;
      }
      .tab:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 2px;
        border-radius: var(--radius-sm, 6px);
      }

      /* ===== 표 머리 — 행(grid)과 같은 열 폭을 쓴다 ===== */
      .head {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr) 110px 130px 300px;
        column-gap: var(--space-4, 16px);
        padding: var(--space-3, 12px) 0;
        border-bottom: 1px solid var(--color-border);
        font-size: var(--text-fine, 12px);
        color: var(--color-ink-3, #9c9c9c);
      }
      /* .pen List Head: 물품명 라벨은 썸네일 위(= 열 맨 앞)에서 시작한다 */
      .h-name {
        grid-column: 1 / 3;
      }
      .h-cat {
        grid-column: 3;
      }
      .h-loc {
        grid-column: 4;
      }
      .h-status {
        grid-column: 5;
      }
      .table {
        border-bottom: 0;
      }

      /* ===== 더보기 ===== */
      .more-row {
        display: flex;
        justify-content: center;
        padding: var(--space-3, 12px) 0;
      }
      .more {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-5, 24px);
        border: none;
        border-radius: var(--radius-sm, 6px);
        background: none;
        color: var(--color-muted);
        font-family: inherit;
        font-size: 1rem;
        cursor: pointer;
      }
      .more:hover {
        background: var(--color-surface);
      }
      .more:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 2px;
      }
      .more[disabled] {
        color: var(--color-muted);
        cursor: default;
      }
      .more svg {
        width: 16px;
        height: 16px;
      }
      .truncated {
        margin: 0 0 var(--space-2);
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }

      /* ===== 좁은 화면 — 물품 현황 (M) ===== */
      @media (max-width: 859px) {
        .tabs {
          gap: var(--space-4, 16px);
        }
        .tab {
          font-size: 0.875rem;
        }
        .head {
          display: none;
        }
        .more {
          font-size: var(--text-body, 15px);
        }
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.unsub = session.subscribe(() => void this.syncRole());
    await session.ensure();
    if (!this.isConnected) return;
    this.isAdmin = session.isAdmin;
    if (this.isAdmin) void this.loadAdmin();
    else void this.fetchItems();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsub?.();
    this.unsub = null;
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected willUpdate(changed: PropertyValues) {
    super.willUpdate(changed);
    if (this.hasUpdated && changed.has("q")) this.shown = PAGE_SIZE;
    if (this.hasUpdated && changed.has("q") && !this.isAdmin) this.scheduleFetch();
  }

  // 역할 변경(로그인·로그아웃·강등) — 모드를 갈아끼우고 다른 모드 데이터는 버린다
  private async syncRole() {
    const admin = session.isAdmin;
    if (admin === this.isAdmin) return;
    this.isAdmin = admin;
    this.tab = "all";
    this.shown = PAGE_SIZE;
    if (admin) {
      void this.loadAdmin();
    } else {
      this.adminGen += 1;
      this.adminItems = [];
      this.adminError = "";
      this.summary = null;
      if (this.items.length === 0) void this.fetchItems();
    }
  }

  // ===== 관리자 모드 =====

  private async loadAdmin() {
    const gen = ++this.adminGen;
    this.adminLoading = true;
    this.adminError = "";
    try {
      const listRes = await api<AdminListResponse>("/api/admin/items?limit=1000");
      if (gen !== this.adminGen || !this.isAdmin) return;
      this.adminItems = listRes.items;
      this.truncated = listRes.hasMore === true;
      this.summary = catalogSummary(listRes.items);
      this.shown = PAGE_SIZE;
    } catch (e) {
      if (gen !== this.adminGen || !this.isAdmin) return;
      this.adminError = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      if (gen === this.adminGen && this.isAdmin) this.adminLoading = false;
    }
  }

  // 관리자 목록 — 전체를 받아 두고 탭·검색을 클라이언트에서 건다
  private get adminVisible(): Item[] {
    const q = this.q.trim().toLowerCase();
    return this.adminItems.filter((it) => {
      if (!this.matchesTab(it)) return false;
      if (!q) return true;
      const cats = it.categories ?? [];
      const hay = `${it.name} ${it.location ?? ""} ${it.description ?? ""} ${cats.map((c) => c.name).join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  }

  // ===== 회원 모드 데이터 =====

  private scheduleFetch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.fetchItems(), 250);
  }

  private stateParam(): string | null {
    return this.tab === "all" ? null : this.tab;
  }

  private browseUrl(offset: number): string {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    const state = this.stateParam();
    if (state) params.set("state", state);
    return `/api/items?${params.toString()}`;
  }

  private async fetchItems() {
    const gen = ++this.fetchGen;
    const first = this.items.length === 0;
    if (first) this.loading = true;
    this.error = "";
    this.noticeMsg = "";
    try {
      if (this.q) {
        const params = new URLSearchParams({ q: this.q });
        const { items } = await api<{ items: Item[] }>(`/api/items?${params}`);
        if (gen !== this.fetchGen || this.isAdmin) return;
        this.items = items;
        this.hasMore = false;
        // 검색 결과는 페이지네이션이 없다 — 요약도 결과 집합 기준이다.
        // (전체 카탈로그 요약과 섞이면 칩 숫자가 결과와 어긋난다)
        this.summary = catalogSummary(items);
      } else {
        const res = await api<BrowseResponse>(this.browseUrl(0));
        if (gen !== this.fetchGen || this.isAdmin) return;
        this.items = res.items;
        this.hasMore = res.hasMore;
        // 요약은 state 필터와 무관한 모집단 기준 — 탭 라벨이 필터에 흔들리지 않는다
        // (응답에 summary 가 없으면 받은 행으로 폴백 — 구버전 API·목 응답 방어)
        this.summary = res.summary ?? catalogSummary(res.items);
      }
    } catch (e) {
      if (gen !== this.fetchGen || this.isAdmin) return;
      this.error = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      if (gen === this.fetchGen && !this.isAdmin) this.loading = false;
    }
  }

  private async loadMore() {
    if (this.q || this.loading || this.loadingMore || !this.hasMore || this.isAdmin) return;
    const gen = this.fetchGen;
    this.loadingMore = true;
    try {
      const res = await api<BrowseResponse>(this.browseUrl(this.items.length));
      // 탭 전환·검색으로 세대가 바뀌었으면 이어붙이지 않는다 (다른 필터의 행이 섞인다)
      if (gen !== this.fetchGen || this.q || this.isAdmin) return;
      this.items = [...this.items, ...res.items];
      this.hasMore = res.hasMore;
    } catch {
      this.noticeMsg = "더 불러오지 못했어요 — 다시 시도해 주세요";
    } finally {
      this.loadingMore = false;
    }
  }

  private async retryMore() {
    this.noticeMsg = "";
    await this.loadMore();
  }

  // ===== 공통 =====

  private matchesTab(it: Item): boolean {
    if (this.tab === "all") return true;
    if (this.tab === "rented") return (it.active_now ?? 0) > 0;
    // 소모품은 '대여' 대상이 아니다 — 요약 숫자와 같은 규칙
    return it.kind !== "consumable" && availableQty(it) > 0;
  }

  private setTab(key: TabKey) {
    if (this.tab === key) return;
    this.tab = key;
    this.shown = PAGE_SIZE;
    if (this.isAdmin) return;
    // 검색 결과는 이미 전부 받아 두었으니 클라이언트에서 거르고,
    // 탐색은 서버에서 상태 필터로 다시 받는다 (페이지네이션이 걸려 있다).
    if (!this.q) {
      // 이전 탭의 행이 남아 보이지 않게 비우고 로딩 상태로 되돌린다
      this.items = [];
      this.loading = true;
      void this.fetchItems();
    }
  }

  private hrefFor(it: Item): string {
    return this.isAdmin ? `/items/${it.id}/edit` : `/items/${it.id}${location.search}`;
  }

  private displayedSummary(): CatalogSummary {
    return this.summary ?? { types: 0, available: 0, rented: 0, repair: 0 };
  }

  // 요약은 page-home 이 그린다 — 모바일에서 요약 → 검색 → 탭 순서를 맞추기 위해
  // 데이터 소유자(explorer)가 값만 올려보낸다. 값이 바뀔 때만 이벤트를 낸다.
  protected updated(changed: PropertyValues) {
    super.updated(changed);
    const s = this.displayedSummary();
    const key = `${s.types}/${s.available}/${s.rented}/${s.repair}`;
    if (key === this.lastSummaryKey) return;
    this.lastSummaryKey = key;
    this.dispatchEvent(
      new CustomEvent<CatalogSummary>("summary-change", {
        detail: s,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private tabCount(key: TabKey): number {
    const s = this.displayedSummary();
    if (key === "all") return s.types;
    if (key === "rented") return s.rented;
    return s.available;
  }

  private emptyText(): string {
    if (this.q) return `'${this.q}'로 찾은 물품이 없어요`;
    const label = TABS.find((t) => t.key === this.tab)?.label;
    if (label && this.tab !== "all") return `'${label}' 물품이 없어요`;
    return "등록된 물품이 없어요";
  }

  // ===== 렌더 =====

  render() {
    return html`
      <div class="tabs" role="group" aria-label="물품 상태">
        ${TABS.map(
          (t) => html`
            <button
              type="button"
              class="tab"
              aria-pressed=${this.tab === t.key}
              @click=${() => this.setTab(t.key)}
            >
              ${t.label} ${this.tabCount(t.key).toLocaleString("ko-KR")}
            </button>
          `,
        )}
      </div>

      ${this.isAdmin ? this.renderAdmin() : this.renderMember()}
    `;
  }

  private renderMember() {
    // 검색 결과는 전부 받아 두었으므로 10건씩 펼치고, 탐색은 서버 페이지(10건)를 쓴다
    const matched = this.q ? this.items.filter((it) => this.matchesTab(it)) : this.items;
    const visible = this.q ? matched.slice(0, this.shown) : matched;
    if (this.error) {
      return html`<x-empty state="error" text=${this.error}>
        <x-button variant="secondary" size="sm" @click=${() => void this.fetchItems()}>
          다시 시도
        </x-button>
      </x-empty>`;
    }
    if (this.loading) return html`<x-empty state="loading"></x-empty>`;
    if (visible.length === 0) {
      return html`<x-empty state="empty" text=${this.emptyText()}></x-empty>`;
    }
    return html`
      ${this.noticeMsg
        ? html`
            <x-notice>
              ${this.noticeMsg}
              <x-button variant="secondary" size="sm" @click=${() => void this.retryMore()}>
                다시 시도
              </x-button>
            </x-notice>
          `
        : ""}
      ${this.renderHead()}
      <div class="table" role="list">
        ${visible.map(
          (it) => html`<div role="listitem">
            <item-list-row .item=${it} href=${this.hrefFor(it)}></item-list-row>
          </div>`,
        )}
      </div>
      ${(this.q ? matched.length > this.shown : this.hasMore) ? this.renderMore() : ""}
    `;
  }

  private renderAdmin() {
    if (this.adminLoading) return html`<x-empty state="loading"></x-empty>`;
    if (this.adminError) {
      return html`<x-empty state="error" text=${this.adminError}>
        <x-button variant="secondary" size="sm" @click=${() => void this.loadAdmin()}>
          다시 시도
        </x-button>
      </x-empty>`;
    }
    const visible = this.adminVisible;
    if (visible.length === 0) {
      return html`<x-empty compact state="empty" text=${this.emptyText()}></x-empty>`;
    }
    const page = visible.slice(0, this.shown);
    return html`
      ${this.truncated
        ? html`<p class="truncated">1000건까지만 불러왔어요 — 목록이 잘렸을 수 있어요</p>`
        : ""}
      ${this.renderHead()}
      <div class="table" role="list">
        ${page.map(
          (it) => html`<div role="listitem">
            <item-list-row .item=${it} href=${this.hrefFor(it)}></item-list-row>
          </div>`,
        )}
      </div>
      ${this.shown < visible.length ? this.renderMore() : ""}
    `;
  }

  private lastSummaryKey = "";

  private renderHead() {
    return html`
      <div class="head" aria-hidden="true">
        <span class="h-name">물품명</span>
        <span class="h-cat">분류</span>
        <span class="h-loc">보관 위치</span>
        <span class="h-status">상태</span>
      </div>
    `;
  }

  private renderMore() {
    return html`
      <div class="more-row">
        <button
          type="button"
          class="more"
          ?disabled=${this.loadingMore}
          @click=${() => this.more()}
        >
          ${this.loadingMore
            ? "불러오는 중…"
            : html`
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
                더보기
              `}
        </button>
      </div>
    `;
  }

  private more() {
    // 관리자(전체 로드)와 검색 결과(전체 로드)는 보여줄 개수만 늘리고,
    // 회원 탐색은 서버에서 다음 페이지를 받는다.
    if (this.isAdmin || this.q) {
      this.shown += PAGE_SIZE;
      return;
    }
    void this.loadMore();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-explorer": ItemExplorer;
  }
}
