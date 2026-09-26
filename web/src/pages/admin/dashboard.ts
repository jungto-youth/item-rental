import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../../api/client";
import type { Dashboard, DashboardItem, DashboardRenter } from "../../types";
import { reduceMotion } from "../../styles/motion";
import { filterChipsCss } from "../../styles/controls";
import "../../components/admin/admin-page";
import "../../components/ui/badge";
import "../../components/ui/empty";
import { rowsCss } from "../../components/ui/rows";

// 관리자 물품 현황 — 물품별 현재 상태.
// 상태 그룹(대여 중·점검·수리·대여 가능·소모품·폐기)을 필터 칩으로 내걸어
// home(전체/대여 가능만)과 같은 상호작용으로 좁혀 본다. 그룹 판정은
// item-card.ts 의 배지 로직과 같은 우선순위를 쓴다.
type GroupKey = "rented" | "repair" | "available" | "consumable" | "retired";

const SECTIONS: { key: GroupKey; title: string }[] = [
  { key: "rented", title: "대여 중" },
  { key: "repair", title: "점검·수리 중" },
  { key: "available", title: "대여 가능" },
  { key: "consumable", title: "소모품" },
  { key: "retired", title: "폐기" },
];

@customElement("page-admin-dashboard")
export class PageAdminDashboard extends LitElement {
  @state() private data: Dashboard | null = null;
  @state() private loading = true;
  @state() private error = "";
  // "all" | GroupKey — 홈의 전체/대여 가능만 칩과 같은 단일 선택 필터
  @state() private activeGroup: GroupKey | "all" = "all";

  static styles = [
    reduceMotion,
    rowsCss,
    filterChipsCss,
    css`
      section {
        margin-bottom: var(--space-5);
      }
      h2 {
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0 0 var(--space-2);
      }
      /* 공용 .rows/.row 조형 위에 썸네일 배치 덮어쓰기 */
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .thumb-link {
        flex-shrink: 0;
        text-decoration: none;
      }
      .thumb {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm, 6px);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        font-size: var(--text-title, 1.25rem);
        overflow: hidden;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .info {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 2px;
      }
      .name-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
      }
      .name {
        color: var(--color-text);
        text-decoration: none;
      }
      .name:hover {
        color: var(--color-primary);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    await this.reload();
  }

  private async reload() {
    this.loading = true;
    this.error = "";
    try {
      this.data = await api<Dashboard>("/api/admin/dashboard");
    } catch (e) {
      this.error = e instanceof Error ? e.message : "물품 현황을 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  // 그룹 판정 — item-card.ts 와 같은 우선순위 (폐기 > 소모품 > 점검·수리 > 대여 중 > 대여 가능)
  private groupOf(it: DashboardItem): GroupKey {
    if (it.status === "retired") return "retired";
    if (it.kind === "consumable") return "consumable";
    if (it.status === "repair" || it.qty_broken >= it.total_qty) return "repair";
    if (it.active_now > 0) return "rented";
    return "available";
  }

  private handleImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = "none";
  }

  // 수량 내역 — 0인 항목은 생략
  private qtyLine(it: DashboardItem) {
    const parts = [`총 ${it.total_qty}`];
    if (it.active_now > 0) parts.push(`대여 중 ${it.active_now}`);
    if (it.qty_broken > 0) parts.push(`수리 ${it.qty_broken}`);
    return parts.join(" · ");
  }

  // 대여자 줄 — 2개 이상만 개수 표시 (1개는 개수가 정보가 없음)
  private renterLabel(r: DashboardRenter) {
    const who = r.member_name ?? "회원";
    const qty = r.qty > 1 ? ` · ${r.qty}개` : "";
    const phone = r.member_phone ? ` · ${r.member_phone}` : "";
    return `${who}${qty}${phone}`;
  }

  private row(it: DashboardItem) {
    return html`
      <li class="row">
        <a class="thumb-link" href="/items/${it.id}" aria-label=${it.name}>
          ${it.photo
            ? html`<div class="thumb"><img src=${it.photo} alt="" loading="lazy" @error=${this.handleImgError} /></div>`
            : html`<div class="thumb">📦</div>`}
        </a>
        <div class="info">
          <div class="name-row">
            <a class="name" href="/items/${it.id}">${it.name}</a>
            ${it.kind === "consumable" ? html`<x-badge kind="neutral" label="소모품"></x-badge>` : ""}
          </div>
          <div class="meta">${this.qtyLine(it)}</div>
          ${it.current_renters.length > 0
            ? html`<div class="meta">${it.current_renters.map((r) => this.renterLabel(r)).join(", ")}</div>`
            : ""}
        </div>
      </li>
    `;
  }

  private renderSection(title: string, rows: DashboardItem[]) {
    if (rows.length === 0) return "";
    return html`
      <section>
        <h2>${title}</h2>
        <ul class="rows">${rows.map((it) => this.row(it))}</ul>
      </section>
    `;
  }

  // 그룹별 버킷 + 정렬 (대여 중: active_now desc, 나머지: name asc)
  private groupItems(items: DashboardItem[]) {
    const g: Record<GroupKey, DashboardItem[]> = {
      rented: [],
      repair: [],
      available: [],
      consumable: [],
      retired: [],
    };
    for (const it of items) g[this.groupOf(it)].push(it);
    const byName = (a: DashboardItem, b: DashboardItem) => a.name.localeCompare(b.name, "ko");
    g.rented.sort((a, b) => b.active_now - a.active_now || byName(a, b));
    for (const key of ["repair", "available", "consumable", "retired"] as GroupKey[]) {
      g[key].sort(byName);
    }
    return g;
  }

  render() {
    const items = this.data?.items;
    const g = items ? this.groupItems(items) : null;
    return html`
      <admin-page
        active="dashboard"
        title="물품 현황"
        ?loading=${this.loading}
        .error=${this.error}
        @retry=${() => void this.reload()}
      >
        ${items && items.length === 0
          ? html`<x-empty compact state="empty" text="등록된 물품이 없어요"></x-empty>`
          : ""}
        ${items && items.length > 0 && g ? this.renderChips(items, g) : ""}
        ${g
          ? this.activeGroup === "all"
            ? SECTIONS.map((s) => this.renderSection(s.title, g[s.key]))
            : this.renderGroup(g[this.activeGroup])
          : ""}
      </admin-page>
    `;
  }

  // 상태 필터 칩 — 홈(전체/대여 가능만)과 같은 조형·상호작용. 개수는
  // 이미 그룹핑된 버킷에서 센다 (서버 왕복 없음)
  private renderChips(items: DashboardItem[], g: Record<GroupKey, DashboardItem[]>) {
    const chip = (key: GroupKey | "all", label: string, count: number) => html`
      <button
        type="button"
        class="filter-chip ${this.activeGroup === key ? "active" : ""}"
        aria-pressed=${this.activeGroup === key}
        @click=${() => (this.activeGroup = key)}
      >
        ${label} <span class="count">${count}</span>
      </button>
    `;
    return html`
      <div class="filter-row">
        ${chip("all", "전체", items.length)}
        ${SECTIONS.map((s) => chip(s.key, s.title, g[s.key].length))}
      </div>
    `;
  }

  // 특정 그룹 칩 선택 — 섹션 헤더 없이 해당 그룹만 플랫 목록으로
  private renderGroup(rows: DashboardItem[]) {
    if (rows.length === 0) {
      return html`<x-empty compact state="empty" text="해당 상태의 물품이 없어요"></x-empty>`;
    }
    return html`<ul class="rows">${rows.map((it) => this.row(it))}</ul>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-dashboard": PageAdminDashboard;
  }
}