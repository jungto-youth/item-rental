import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { session } from "../../../context/session";
import { type Category, type DashboardItem, type DashboardRenter, type Item } from "../../../types";
import { reduceMotion } from "../../../styles/motion";
import { badgeFor, groupKey, isItemAvailable, type StockGroup } from "../../../utils/stock";
import { getCategories } from "../../../utils/categories";
import "../../ui/button";
import "../../ui/chip";
import "../../ui/empty";
import "../../ui/notice";
import "../../common/item-row";
import "./item-card";

// 통합 물품 탐색 — 공개 홈·관리자 물품관리·실시간현황 3화면을 하나로 합쳤다.
// 역할 내재화: 같은 화면을 보고, 관리자(enabled by session.isAdmin)에만
// 등록 버튼·수정 버튼·상태/범주 칩·대여자 패널이 붙는다. 실제 권한은 서버가
// 강제하므로 클라 분기는 순수 UX다. 대여자 전화는 admin API에서만 오고,
// isAdmin일 때만 fetch·렌더한다 (공개 DOM에 닿지 않음).
const PAGE_SIZE = 24;

const GROUPS: { key: StockGroup; title: string }[] = [
  { key: "rented", title: "대여 중" },
  { key: "repair", title: "점검·수리 중" },
  { key: "available", title: "대여 가능" },
  { key: "consumable", title: "소모품" },
  { key: "retired", title: "폐기" },
];

type BrowseResponse = {
  items: Item[];
  total: number;
  available_total: number;
  hasMore: boolean;
};

type AdminListResponse = {
  items: Item[];
  total: number;
  hasMore: boolean;
};

// 목록 상태 — 셸(page-home)이 페이지 헤더(제목·카운트·관리자 액션)에 쓰는 스냅샷.
// 목록 데이터는 explorer 가 소유하되 카운트까지 복제하면 어긋나므로 이벤트로 넘긴다.
export type ItemListState = {
  isAdmin: boolean;
  loading: boolean;
  error: string;
  // 목록 전체 규모(검색 중이면 검색 결과 수)
  total: number;
  // 지금 빌릴 수 있는 물품 수 — 공개 모드만 서버 집계값을 쓴다
  available: number | null;
  // 필터 적용 후 화면에 그려지는 수
  visible: number;
  truncated: boolean;
};

@customElement("item-explorer")
export class ItemExplorer extends LitElement {
  // ===== 셸(home.ts)이 소유하는 상태 =====
  @property() q = "";

  @state() private isAdmin = false;
  private unsub: (() => void) | null = null;

  // ===== 공개 모드 (탐색+검색) =====
  @state() private items: Item[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private total = 0;
  @state() private availTotal = 0;
  @state() private hasMore = false;
  @state() private loadingMore = false;
  @state() private noticeMsg = "";
  @state() private availableOnly = false;

  // ===== 관리자 모드 (스냅샷+클라 필터) =====
  @state() private adminItems: Item[] = [];
  @state() private adminLoading = false;
  @state() private adminError = "";
  @state() private truncated = false;
  @state() private group: StockGroup | "all" = "all";
  @state() private categoryFilter = "all";
  @state() private cats: Category[] = [];
  // 대여자 명단 — itemId → renters. admin API에서만 오고 로그아웃·강등 시 파기.
  @state() private renters = new Map<number, DashboardRenter[]>();
  @state() private expandedId: number | null = null;

  // 세대 번호로 늦은 응답을 버린다
  private fetchGen = 0;
  private adminGen = 0;
  private searchTimer = 0;
  private io: IntersectionObserver | null = null;
  private observedEl: Element | null = null;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      .filters {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
      }
      .filters x-chip {
        flex: 1;
        min-width: 0;
      }
      .subfilters {
        margin: calc(var(--space-4, 16px) * -1 + var(--space-3, 12px)) 0 var(--space-4, 16px);
      }
      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: var(--space-3, 12px);
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
      .renters {
        display: grid;
        gap: var(--space-1, 4px);
      }
      .renters a {
        color: var(--tone-primary-text);
        text-decoration: none;
      }
      .renters a:hover {
        text-decoration: underline;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.unsub = session.subscribe(() => void this.syncRole());
    await session.ensure();
    // ensure() 사이에 unmount되면 상태 반영하지 않음
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
    this.io?.disconnect();
    this.observedEl = null;
  }

  // 역할 변경(로그인·로그아웃·강등) — 모드 전환 + 관리자 데이터 파기/적재.
  // 관리자 데이터(목록·대여자 명단)는 페이지 로컬에만 두고,
  // 비관리자가 되면 즉시 버린다.
  private async syncRole() {
    const admin = session.isAdmin;
    if (admin === this.isAdmin) return;
    this.isAdmin = admin;
    if (admin) {
      void this.loadAdmin();
    } else {
      this.adminGen += 1; // 진행 중 관리자 요청 무효화
      this.adminItems = [];
      this.adminError = "";
      this.renters = new Map();
      this.expandedId = null;
      this.group = "all";
      this.categoryFilter = "all";
      if (this.items.length === 0) void this.fetchItems();
    }
  }

  protected willUpdate(changed: PropertyValues) {
    super.willUpdate(changed);
    if (this.hasUpdated && changed.has("q") && !this.isAdmin) {
      this.scheduleFetch();
    }
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    this.emitState();
    if (this.isAdmin) return; // 관리자 모드는 무한스크롤 없음
    const sentinel = this.renderRoot.querySelector(".sentinel");
    const active = !this.q && !this.loading && !this.error && this.hasMore;
    if (active && sentinel) {
      if (sentinel !== this.observedEl) {
        this.io?.disconnect();
        this.io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) void this.loadMore();
          },
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

  // ===== 공개 모드 데이터 =====

  private scheduleFetch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.fetchItems(), 250);
  }

  private async fetchItems() {
    const gen = ++this.fetchGen;
    const first = this.items.length === 0;
    if (first) this.loading = true;
    this.error = "";
    try {
      if (this.q) {
        const params = new URLSearchParams({ q: this.q });
        const { items } = await api<{ items: Item[] }>(`/api/items?${params}`);
        if (gen !== this.fetchGen || this.isAdmin) return;
        this.items = items;
        this.hasMore = false;
        // 검색 결과는 페이지네이션이 없으므로 total=결과 수다. 이전 탐색의
        // 집계값을 남겨두면 칩 카운트가 검색 결과와 어긋난다.
        this.total = items.length;
        this.availTotal = items.filter((it) => isItemAvailable(it)).length;
      } else {
        const { items, total, available_total, hasMore } = await api<BrowseResponse>(
          `/api/items?${this.browseParams(0)}`,
        );
        if (gen !== this.fetchGen || this.isAdmin) return;
        this.items = items;
        this.total = total;
        this.availTotal = available_total;
        this.hasMore = hasMore;
      }
    } catch (e) {
      if (gen !== this.fetchGen || this.isAdmin) return;
      this.error = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      if (gen === this.fetchGen && !this.isAdmin) this.loading = false;
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

  private async loadMore() {
    if (this.q || this.loading || this.loadingMore || !this.hasMore || this.isAdmin) return;
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

  private setAvailableOnly(v: boolean) {
    if (this.availableOnly === v) return;
    this.availableOnly = v;
    if (!this.q) void this.fetchItems();
  }

  // ===== 관리자 모드 데이터 =====

  private async loadAdmin() {
    const gen = ++this.adminGen;
    this.adminLoading = true;
    this.adminError = "";
    try {
      const [listRes, cats, dash] = await Promise.all([
        api<AdminListResponse>("/api/admin/items?limit=1000"),
        getCategories().catch(() => [] as Category[]),
        // 대여자 명단 — 실패해도 목록은 보여주고 패널에서 안내한다
        api<{ items: DashboardItem[] }>("/api/admin/dashboard").catch(() => null),
      ]);
      if (gen !== this.adminGen || !this.isAdmin) return;
      this.adminItems = listRes.items;
      this.cats = cats;
      this.truncated = listRes.hasMore === true;
      const map = new Map<number, DashboardRenter[]>();
      for (const d of dash?.items ?? []) {
        if (d.current_renters.length > 0) map.set(d.id, d.current_renters);
      }
      this.renters = map;
    } catch (e) {
      if (gen !== this.adminGen || !this.isAdmin) return;
      this.adminError = e instanceof Error ? e.message : "물품 목록을 불러오지 못했어요";
    } finally {
      if (gen === this.adminGen && this.isAdmin) this.adminLoading = false;
    }
  }

  // 관리자 목록 — 상태 그룹 버킷 1회 + 검색·범주 클라이언트 필터
  private get adminVisible(): Item[] {
    const q = this.q.trim().toLowerCase();
    return this.adminItems.filter((it) => {
      if (this.group !== "all" && groupKey(it) !== this.group) return false;
      const cats = it.categories ?? [];
      if (this.categoryFilter === "none") {
        if (cats.length > 0) return false;
      } else if (this.categoryFilter !== "all") {
        if (!cats.some((c) => String(c.id) === this.categoryFilter)) return false;
      }
      if (!q) return true;
      const hay = `${it.name} ${it.location ?? ""} ${it.description ?? ""} ${cats.map((c) => c.name).join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  }

  private toggleRents(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  // ===== 렌더 =====

  // 화면에 실제로 그려지는 목록 기준으로 헤더 카운트를 계산한다 —
  // 관리자는 클라 필터 적용 후, 공개는 서버 total 을 쓴다(무한스크롤).
  private listState(): ItemListState {
    if (this.isAdmin) {
      const visible = this.adminVisible.length;
      return {
        isAdmin: true,
        loading: this.adminLoading,
        error: this.adminError,
        total: this.adminItems.length,
        available: null,
        visible,
        truncated: this.truncated,
      };
    }
    const visible = this.q && this.availableOnly
      ? this.items.filter((it) => isItemAvailable(it)).length
      : this.items.length;
    // total·availTotal 은 검색/탐색 어느 쪽이든 서버 집계가 채운 값이다
    // (fetchItems 가 검색 시에도 결과 수로 덮어쓴다).
    const total = this.total;
    const available = this.availTotal;
    return {
      isAdmin: false,
      loading: this.loading,
      error: this.error,
      total,
      available,
      visible,
      truncated: false,
    };
  }

  // 셸로 카운트·관리자 여부를 알린다 — 헤더에서만 읽는 파생 상태라 이벤트 전용.
  private emitState() {
    this.dispatchEvent(
      new CustomEvent<ItemListState>("list-state", {
        detail: this.listState(),
        bubbles: true,
        composed: true,
      }),
    );
  }

  private emptyText(): string {
    if (this.q) return `'${this.q}'로 찾은 물품이 없어요`;
    if (this.isAdmin) {
      // 필터가 걸린 빈 상태와 진짜로 비어 있는 상태를 구분한다 — 어느 필터 때문인지 알려야
      // 사용자가 다음 행동을 정할 수 있다.
      const groupTitle = GROUPS.find((g) => g.key === this.group)?.title;
      if (groupTitle) return `'${groupTitle}' 물품이 없어요`;
      if (this.categoryFilter === "none") return "카테고리가 없는 물품이 없어요";
      if (this.categoryFilter !== "all") {
        const name = this.cats.find((c) => String(c.id) === this.categoryFilter)?.name;
        if (name) return `'${name}' 물품이 없어요`;
      }
      return "등록된 물품이 없어요";
    }
    if (this.availableOnly) return "지금은 대여 가능한 물품이 없어요";
    return "등록된 물품이 없어요";
  }

  render() {
    return this.isAdmin ? this.renderAdmin() : this.renderPublic();
  }

  private renderPublic() {
    const visibleItems =
      this.q && this.availableOnly
        ? this.items.filter((it) => isItemAvailable(it))
        : this.items;

    return html`
      <div class="filters">
        <x-chip
          ariaLabel="물품 필터"
          .value=${this.availableOnly ? "available" : "all"}
          .options=${[
            { value: "all", label: "전체", count: this.total },
            { value: "available", label: "대여 가능만", count: this.availTotal },
          ]}
          @change=${(e: CustomEvent<{ value: string }>) =>
            this.setAvailableOnly(e.detail.value === "available")}
        ></x-chip>
      </div>

      ${this.noticeMsg
        ? html`
            <x-notice>
              ${this.noticeMsg}
              <x-button
                variant="secondary"
                size="sm"
                @click=${() => void this.retryMore()}
              >
                다시 시도
              </x-button>
            </x-notice>
          `
        : ""}

      ${this.error
        ? html`<x-empty state="error" text=${this.error}>
            <x-button variant="secondary" size="sm" @click=${() => void this.fetchItems()}>
              다시 시도
            </x-button>
          </x-empty>`
        : this.loading
          ? html`<x-empty state="loading"></x-empty>`
          : visibleItems.length === 0
            ? html`<x-empty state="empty" text=${this.emptyText()}></x-empty>`
            : html`
                <div class="grid">
                  ${visibleItems.map((it) => html`<item-card .item=${it}></item-card>`)}
                </div>
                ${!this.q && this.hasMore
                  ? html`
                      ${this.loadingMore
                        ? html`<div class="more-loading" role="status">불러오는 중…</div>`
                        : ""}
                      <div class="sentinel" aria-hidden="true"></div>
                    `
                  : ""}
              `}
    `;
  }

  // 더 불러오기 실패 후 재시도 — 자동 스크롤 재시도(관측)가 아니라 명시적 버튼으로 되돌린다
  private async retryMore() {
    this.noticeMsg = "";
    await this.loadMore();
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
    // 그룹 버킷 1회 — 칩 카운트와 목록이 같은 버킷을 쓴다
    const buckets: Record<StockGroup, Item[]> = {
      rented: [],
      repair: [],
      available: [],
      consumable: [],
      retired: [],
    };
    for (const it of this.adminItems) buckets[groupKey(it)].push(it);
    const visible = this.adminVisible;

    return html`
      <div class="filters">
        <x-chip
          ariaLabel="상태 필터"
          .value=${this.group}
          .options=${[
            { value: "all", label: "전체", count: this.adminItems.length },
            ...GROUPS.map((g) => ({
              value: g.key,
              label: g.title,
              count: buckets[g.key].length,
            })),
          ]}
          @change=${(e: CustomEvent<{ value: string }>) =>
            (this.group = e.detail.value as StockGroup | "all")}
        ></x-chip>
      </div>

      ${this.cats.length > 0
        ? html`
            <div class="subfilters">
              <x-chip
                ariaLabel="범주 필터"
                .value=${this.categoryFilter}
                .options=${[
                  { value: "all", label: "범주 전체" },
                  ...this.cats.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                    count: c.item_count,
                  })),
                  { value: "none", label: "미지정" },
                ]}
                @change=${(e: CustomEvent<{ value: string }>) =>
                  (this.categoryFilter = e.detail.value)}
              ></x-chip>
            </div>
          `
        : ""}
      ${visible.length === 0
        ? html`<x-empty
            compact
            state="empty"
            text=${this.emptyText()}
          ></x-empty>`
        : html`<div>${visible.map((it) => this.renderAdminRow(it))}</div>`}
    `;
  }

  private renderAdminRow(it: Item) {
    const { kind: badgeKind, label: badgeLabel } = badgeFor(it);
    const cats = it.categories ?? [];
    const qty: string[] = [`보유 ${it.total_qty}`];
    if ((it.active_now ?? 0) > 0) qty.push(`대여 중 ${it.active_now}`);
    if ((it.qty_broken ?? 0) > 0) qty.push(`수리 ${it.qty_broken}`);
    const rents = this.renters.get(it.id) ?? [];
    // 이름 클릭도 수정폼으로 — 공개 미리보기는 수정폼의 "공개 보기"에서
    const editHref = `/items/${it.id}/edit`;
    return html`
      <item-row
        .photo=${it.photos?.[0]?.url ?? ""}
        .name=${it.name}
        href=${editHref}
        badgeKind=${badgeKind}
        badgeLabel=${badgeLabel}
        editHref=${editHref}
        ?expandable=${(it.active_now ?? 0) > 0}
        ?expanded=${this.expandedId === it.id}
        @toggle=${() => this.toggleRents(it.id)}
      >
        ${cats.length > 0
          ? cats.map((c) => html`<span class="hl">${c.name}</span>`)
          : html`<span class="dim">미지정</span>`}
        ${it.location ? html`<span>${it.location}</span>` : ""}
        <span>${qty.join(" · ")}</span>
        <div slot="detail" class="renters">
          ${rents.length > 0
            ? rents.map((r) => html`<span>${this.renterLine(r)}</span>`)
            : html`<span>대여 중인데 명단을 불러오지 못했어요 — 새로고침해 주세요</span>`}
        </div>
      </item-row>
    `;
  }

  private renterLine(r: DashboardRenter) {
    const who = r.member_name ?? "회원";
    const qty = r.qty > 1 ? ` · ${r.qty}개` : "";
    const phone = r.member_phone;
    const tel = phone
      ? html` · <a href="tel:${phone.replace(/[^+\d]/g, "")}">${phone}</a>`
      : "";
    return html`${who}${qty}${tel}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-explorer": ItemExplorer;
  }
}
