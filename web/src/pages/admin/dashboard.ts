import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../../api/client";
import type { Dashboard, DashboardItem, DashboardRenter } from "../../types";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-nav";
import "../../components/ui/badge";
import "../../components/ui/empty";
import "../../components/ui/page-header";

// 관리자 물품 현황 — 물품별 현재 상태.
// 예약 건수 카드·처리 목록 대신, 전체 물품(폐기 포함)을 상태 그룹으로 나눠 보여준다.
// 그룹 판정은 item-card.ts 의 배지 로직과 같은 우선순위를 쓴다.
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
  @state() private error = "";

  static styles = [
    reduceMotion,
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
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        overflow: hidden;
        background: var(--color-surface);
      }
      li {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }
      li:last-child {
        border-bottom: 0;
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
        font-size: 1.25rem;
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
        font-size: var(--text-body, 15px);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        color: var(--color-text);
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .name:hover {
        color: var(--color-primary);
      }
      .meta {
        font-size: var(--text-fine, 12px);
        color: var(--color-muted);
      }
      .renters {
        font-size: var(--text-fine, 12px);
        color: var(--color-muted);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.data = await api<Dashboard>("/api/admin/dashboard");
    } catch (e) {
      this.error = e instanceof Error ? e.message : "오류";
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
      <li>
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
            ? html`<div class="renters">${it.current_renters.map((r) => this.renterLabel(r)).join(", ")}</div>`
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
        <ul>${rows.map((it) => this.row(it))}</ul>
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
    if (this.error) {
      return html`
        <x-page-header title="물품 현황"></x-page-header>
        <x-empty state="error" text=${this.error}></x-empty>
      `;
    }
    if (!this.data) {
      return html`
        <x-page-header title="물품 현황"></x-page-header>
        <x-empty state="loading"></x-empty>
      `;
    }
    const items = this.data.items;
    const g = this.groupItems(items);
    const summary =
      `전체 ${items.length}개 · 대여 중 ${g.rented.length} · 점검·수리 ${g.repair.length}` +
      ` · 소모품 ${g.consumable.length} · 폐기 ${g.retired.length}`;
    return html`
      <admin-nav active="dashboard"></admin-nav>
      <x-page-header title="물품 현황" subtitle=${summary}></x-page-header>
      ${items.length === 0 ? html`<x-empty compact state="empty" text="등록된 물품이 없어요"></x-empty>` : ""}
      ${SECTIONS.map((s) => this.renderSection(s.title, g[s.key]))}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-dashboard": PageAdminDashboard;
  }
}