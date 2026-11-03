import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { session } from "../../../context/session";
import { navigate } from "../../../router";
import { type Item } from "../../../types";
import { reduceMotion } from "../../../styles/motion";
import { availableQty } from "../../../utils/stock";
import "../../ui/button";
import "../../ui/empty";
import "../../ui/notice";
import "./item-card";

// 물품 현황 목록 — 데스크탑은 한 장의 목록 시트, 모바일은 3줄 카드로 접힌다.
// 관리자와 회원이 같은 행 모양을 쓰고, 행 목적지만 다르다(수정 폼 / 상세).
// 상태 칸은 shared/stock.statusParts 가 만든다 — 수량 0 인 항은 구분점까지 숨긴다.
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
  // 필터 탭은 home 이 소유한다 — 검색창과 같은 줄에 칩을 두기 위해.
  // 값이 바뀌면 이 컴포넌트가 데이터를 다시 받아 목록을 갈아끼운다.
  @property() tab: TabKey = "all";

  @state() private isAdmin = false;

  // ===== 회원 모드 =====
  @state() private items: Item[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private hasMore = false;
  @state() private loadingMore = false;
  @state() private noticeMsg = "";

  // ===== 관리자 모드 =====
  @state() private adminItems: Item[] = [];
  @state() private adminLoading = false;
  @state() private adminError = "";
  @state() private truncated = false;
  @state() private shown = PAGE_SIZE;

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

      .notice {
        display: block;
        margin: 0 0 var(--space-2);
      }

      /* ===== 카드 그리드 — 사진이 먼저 보이는 카탈로그 ===== */
      .grid {
        display: grid;
        /* 시안과 같은 3 / 4 / 5열 — 390·768·1280에서 카드 폭이 예측 가능하다 */
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-1);
        margin: 0 0 var(--space-3);
      }
      @media (min-width: 768px) {
        .grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      @media (min-width: 1280px) {
        .grid {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
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
        .notice {
          margin: 0 0 var(--space-2);
        }
        .grid {
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

      /* 로딩 스켈레톤 — 실제 카드와 같은 골격으로 화면이 튀지 않게 */
      .skeleton-card {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
      }
      .sk-photo {
        aspect-ratio: 4 / 3;
        background: var(--surface-muted);
      }
      .sk-body {
        display: grid;
        gap: var(--space-1);
        padding: var(--space-2);
      }
      .sk-line {
        height: 12px;
        border-radius: 4px;
        background: var(--border);
      }
      .sk-line.title {
        height: 16px;
        width: 75%;
      }
      .sk-line.short {
        width: 50%;
      }
      .sk-line.mid {
        width: 66%;
      }
      .sk-photo,
      .sk-line {
        animation: pulse 1.4s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.55;
        }
      }
      @media (max-width: 767px) {
        .skeleton-card:nth-child(n + 4) {
          display: none;
        }
        .sk-body {
          padding: var(--space-1);
        }
      }
      @media (min-width: 768px) and (max-width: 1279px) {
        .skeleton-card:nth-child(n + 5) {
          display: none;
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
    if (this.hasUpdated && (changed.has("q") || changed.has("tab"))) {
      this.shown = PAGE_SIZE;
    }
    if (this.hasUpdated && changed.has("q") && !this.isAdmin) this.scheduleFetch();
    // 탭 전환 — 관리자는 전체를 받아 두었으니 클라이언트에서 거르고,
    // 회원 탐색은 서버 상태 필터로 다시 받는다.
    if (this.hasUpdated && changed.has("tab") && !this.isAdmin && !this.q) {
      this.items = [];
      this.loading = true;
      void this.fetchItems();
    }
  }

  // 역할 변경(로그인·로그아웃·강등) — 모드를 갈아끼우고 다른 모드 데이터는 버린다
  private async syncRole() {
    const admin = session.isAdmin;
    if (admin === this.isAdmin) return;
    this.isAdmin = admin;
    this.shown = PAGE_SIZE;
    if (admin) {
      void this.loadAdmin();
    } else {
      this.adminGen += 1;
      this.adminItems = [];
      this.adminError = "";
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
      } else {
        const res = await api<BrowseResponse>(this.browseUrl(0));
        if (gen !== this.fetchGen || this.isAdmin) return;
        this.items = res.items;
        this.hasMore = res.hasMore;
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

  private hrefFor(it: Item): string {
    return this.isAdmin ? `/items/${it.id}/edit` : `/items/${it.id}${location.search}`;
  }

  // 검색어 지우기는 home 이 소유한다 (URL·입력값 동기화)
  private clearSearch() {
    this.dispatchEvent(new CustomEvent("clear-search", { bubbles: true, composed: true }));
  }

  // 빈 상태 문구 — 제목과 다음 행동을 나눠 x-empty 에 넘긴다
  private emptyCopy(): { title: string; subtitle: string } {
    if (this.q) {
      return {
        title: `'${this.q}'로 찾은 물품이 없어요`,
        subtitle: "다른 이름이나 위치로 검색해 보세요.",
      };
    }
    const label = TABS.find((t) => t.key === this.tab)?.label;
    if (label && this.tab !== "all") {
      return {
        title: `'${label}' 물품이 없어요`,
        subtitle: "다른 상태를 선택해 보세요.",
      };
    }
    return {
      title: "등록된 물품이 없어요",
      subtitle: this.isAdmin
        ? "첫 물품을 등록하면 회원이 바로 대여할 수 있어요."
        : "관리자가 물품을 등록하면 여기에 표시돼요.",
    };
  }

  // ===== 렌더 =====

  // 로딩·빈 상태·오류도 목록과 같은 시트 안에 그려 화면이 튀지 않게 한다
  private renderSkeleton() {
    return html`
      <div class="grid" role="status" aria-label="물품 목록을 불러오는 중">
        ${Array.from(
          { length: 5 },
          () => html`
            <div class="skeleton-card" aria-hidden="true">
              <div class="sk-photo"></div>
              <div class="sk-body">
                <div class="sk-line title"></div>
                <div class="sk-line short"></div>
                <div class="sk-line mid"></div>
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderState(
    state: "loading" | "empty" | "error",
    text = "",
    action: unknown = "",
    subtitle = "",
  ) {
    return html`
      <div class="panel">
        <x-empty state=${state} text=${text} subtitle=${subtitle}>${action}</x-empty>
      </div>
    `;
  }

  render() {
    return html`${this.isAdmin ? this.renderAdmin() : this.renderMember()}`;
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
        "연결 상태를 확인하고 다시 시도해 주세요.",
      );
    }
    if (this.loading) return this.renderSkeleton();
    if (visible.length === 0) {
      const copy = this.emptyCopy();
      return this.renderState(
        "empty",
        copy.title,
        this.q
          ? html`<x-button variant="secondary" @click=${this.clearSearch}>
              검색어 지우기
            </x-button>`
          : "",
        copy.subtitle,
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
    if (this.adminLoading) return this.renderSkeleton();
    if (this.adminError) {
      return this.renderState(
        "error",
        this.adminError,
        html`<x-button variant="secondary" @click=${() => void this.loadAdmin()}>
          다시 시도
        </x-button>`,
        "연결 상태를 확인하고 다시 시도해 주세요.",
      );
    }
    const visible = this.adminVisible;
    if (visible.length === 0) {
      const copy = this.emptyCopy();
      return this.renderState(
        "empty",
        copy.title,
        this.q
          ? html`<x-button variant="secondary" @click=${this.clearSearch}>
              검색어 지우기
            </x-button>`
          : html`<x-button variant="primary" @click=${() => navigate("/items/new")}>
              물품 등록
            </x-button>`,
        copy.subtitle,
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
          variant="quiet"
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
