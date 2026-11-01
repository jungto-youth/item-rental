import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { session } from "../../../context/session";
import { navigate } from "../../../router";
import { type CatalogSummary, type Item } from "../../../types";
import { reduceMotion } from "../../../styles/motion";
import { availableQty, catalogSummary } from "../../../utils/stock";
import "../../ui/button";
import "../../ui/chip";
import "../../ui/empty";
import "../../ui/notice";
import "./item-card";

// 물품 현황 목록 — 데스크탑은 한 장의 목록 시트, 모바일은 3줄 카드로 접힌다.
// 관리자와 회원이 같은 행 모양을 쓰고, 행 목적지만 다르다(수정 폼 / 상세).
// 탭·목록의 숫자 규칙은 이슈 #12 §6.2·§6.4 를 따른다:
//   - 탭 숫자(총 종류·대여 가능·대여 중·수리 중)는 API summary 다. 폐기는 어느 값에도 넣지 않는다.
//   - 탭 라벨은 같은 합계를 쓴다. 행 수와 다를 수 있다.
//   - 상태 칸은 shared/stock.statusParts 가 만든다 — 수량 0 인 항은 구분점까지 숨긴다.
type TabKey = "all" | "available" | "rented" | "repair";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "available", label: "대여 가능" },
  { key: "rented", label: "대여 중" },
  { key: "repair", label: "수리 중" },
];

// 목록은 한 번에 10건씩 — 회원은 서버 페이지, 관리자는 전체를 받아 두고 10건씩 펼친다.
// '더보기'를 누를 때마다 같은 수만큼 더 보여준다 (.pen 물품 현황 / (M)).
const PAGE_SIZE = 10;

type BrowseResponse = {
  items: Item[];
  total: number;
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
        display: flex;
        flex-direction: column;
      }

      /* 필터 칩 — 페이지 본문과 같은 폭 */
      x-chip {
        display: block;
        box-sizing: border-box;
        padding: 0 0 var(--space-2);
      }

      .notice {
        display: block;
        margin: 0 0 var(--space-2);
      }

      /* ===== 카드 그리드 — 사진이 먼저 보이는 카탈로그 ===== */
      .grid {
        display: grid;
        /* 카드 최소 220px — 1280에서 5열, 좁아지면 자연스럽게 줄어든다 */
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--space-1);
        margin: 0 0 var(--space-3);
      }
      /* 빈 상태·로딩·오류 — 그리드와 같은 폭의 자리 */
      .panel {
        margin: 0 0 var(--space-3);
        box-sizing: border-box;
      }

      .more-row {
        display: flex;
        justify-content: center;
        margin: 0 0 var(--space-4);
      }

      @media (max-width: 639px) {
        x-chip {
          padding: 0 0 var(--space-2);
        }
        .notice {
          margin: 0 0 var(--space-2);
        }
        .grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--space-1);
          margin: 0 0 var(--space-2);
        }
        .panel {
          margin: 0 0 var(--space-2);
        }
        .more-row {
          margin: 0 0 var(--space-4);
        }
        .truncated {
          margin: 0 0 var(--space-2);
        }
      }
      /* 아주 좁은 화면에서는 두 장씩 — 3열은 너무 좁아진다 */
      @media (max-width: 359px) {
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .truncated {
        margin: 0 0 var(--space-2);
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height);
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

  // 관리자 목록 — 전체를 받아 두고 탭·검색을 클라이언트에서 건다.
  // 검색어는 탭과 무관하게 먼저 적용한다 — 칩 숫자도 같은 결과 집합을 세야 한다.
  private get adminQueryMatches(): Item[] {
    const q = this.q.trim().toLowerCase();
    if (!q) return this.adminItems;
    return this.adminItems.filter((it) => {
      const cats = it.categories ?? [];
      const hay = `${it.name} ${it.location ?? ""} ${it.description ?? ""} ${cats.map((c) => c.name).join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  }

  private get adminVisible(): Item[] {
    return this.adminQueryMatches.filter((it) => this.matchesTab(it));
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
    if (this.tab === "repair") return it.lifecycle !== "retired" && (it.qty_repair ?? 0) > 0;
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
    if (this.isAdmin) return catalogSummary(this.adminQueryMatches);
    return this.summary ?? { types: 0, available: 0, rented: 0, repair: 0 };
  }

  private tabCount(key: TabKey): number {
    const s = this.displayedSummary();
    if (key === "all") return s.types;
    if (key === "available") return s.available;
    if (key === "rented") return s.rented;
    return s.repair;
  }

  // 검색어 지우기는 home 이 소유한다 (URL·입력값 동기화)
  private clearSearch() {
    this.dispatchEvent(new CustomEvent("clear-search", { bubbles: true, composed: true }));
  }

  private emptyText(): string {
    if (this.q) return `'${this.q}'로 찾은 물품이 없어요`;
    const label = TABS.find((t) => t.key === this.tab)?.label;
    if (label && this.tab !== "all") return `'${label}' 물품이 없어요`;
    return "등록된 물품이 없어요";
  }

  // ===== 렌더 =====

  // 로딩·빈 상태·오류도 목록과 같은 시트 안에 그려 화면이 튀지 않게 한다
  private renderState(
    state: "loading" | "empty" | "error",
    text = "",
    action: unknown = "",
  ) {
    return html`
      <div class="panel">
        <x-empty state=${state} text=${text}>${action}</x-empty>
      </div>
    `;
  }

  render() {
    return html`
      <x-chip
        ariaLabel="물품 상태 필터"
        .value=${this.tab}
        .options=${TABS.map((t) => ({
          value: t.key,
          label: t.label,
          count: this.tabCount(t.key),
        }))}
        @change=${(e: CustomEvent<{ value: string }>) =>
          this.setTab(e.detail.value as TabKey)}
      ></x-chip>

      ${this.isAdmin ? this.renderAdmin() : this.renderMember()}
    `;
  }

  private renderMember() {
    // 검색 결과는 전부 받아 두었으므로 10건씩 펼치고, 탐색은 서버 페이지(10건)를 쓴다
    const matched = this.q ? this.items.filter((it) => this.matchesTab(it)) : this.items;
    const visible = this.q ? matched.slice(0, this.shown) : matched;
    if (this.error) {
      return this.renderState(
        "error",
        this.error,
        html`<x-button variant="secondary" @click=${() => void this.fetchItems()}>
          다시 시도
        </x-button>`,
      );
    }
    if (this.loading) return this.renderState("loading");
    if (visible.length === 0) {
      return this.renderState(
        "empty",
        this.emptyText(),
        this.q
          ? html`<x-button variant="secondary" @click=${this.clearSearch}>
              검색어 지우기
            </x-button>`
          : "",
      );
    }
    return html`
      ${this.noticeMsg
        ? html`
            <div class="notice">
              <x-notice>
                ${this.noticeMsg}
                <x-button
                  slot="action"
                  variant="secondary"
                  @click=${() => void this.retryMore()}
                >
                  다시 시도
                </x-button>
              </x-notice>
            </div>
          `
        : ""}
      ${this.renderGrid(
        visible,
        this.q ? matched.length > this.shown : this.hasMore,
      )}
    `;
  }

  private renderAdmin() {
    if (this.adminLoading) return this.renderState("loading");
    if (this.adminError) {
      return this.renderState(
        "error",
        this.adminError,
        html`<x-button variant="secondary" @click=${() => void this.loadAdmin()}>
          다시 시도
        </x-button>`,
      );
    }
    const visible = this.adminVisible;
    if (visible.length === 0) {
      return this.renderState(
        "empty",
        this.emptyText(),
        this.q
          ? html`<x-button variant="secondary" @click=${this.clearSearch}>
              검색어 지우기
            </x-button>`
          : html`<x-button variant="primary" @click=${() => navigate("/items/new")}>
              물품 등록
            </x-button>`,
      );
    }
    return html`
      ${this.truncated
        ? html`<p class="truncated">1000건까지만 불러왔어요 — 목록이 잘렸을 수 있어요</p>`
        : ""}
      ${this.renderGrid(visible.slice(0, this.shown), this.shown < visible.length)}
    `;
  }

  // 회원·관리자 공용 카드 그리드
  private renderGrid(items: Item[], hasMore: boolean) {
    return html`
      <div class="grid" role="list">
        ${items.map(
          (it) => html`<item-card
            role="listitem"
            .item=${it}
            href=${this.hrefFor(it)}
          ></item-card>`,
        )}
      </div>
      ${hasMore ? this.renderMore() : ""}
    `;
  }

  private renderMore() {
    return html`
      <div class="more-row">
        <x-button
          variant="secondary"
          ?loading=${this.loadingMore}
          @click=${() => this.more()}
        >
          ${this.loadingMore ? "불러오는 중…" : "더보기"}
        </x-button>
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
