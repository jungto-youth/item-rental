import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../../api/client";
import type { Category, Item, ItemKind, ItemStatus } from "../../types";
import { rowsCss } from "../../components/ui/rows";
import "../../components/admin/admin-nav";
import "../../components/ui/empty";
import "../../components/ui/button";
import "../../components/features/item/item-create-dialog";
import "../../components/features/item/item-edit-dialog";
import "../../components/features/category/category-manage-dialog";

// SPEC §4.4 — 물품 관리: 전체 물품(폐기 포함) 목록 + 카테고리 필터 + 등록·수정·카테고리 관리.
// 회원용 탐색은 홈(검색)이 담당하고, 이 화면이 관리자가 물품과 카테고리를 함께 관리하는 창구다.
type AdminItem = {
  id: number;
  name: string;
  description: string | null;
  status: ItemStatus;
  total_qty: number;
  qty_broken: number;
  kind: ItemKind;
  location: string | null;
  category_id: number | null;
  category_name: string | null;
  thumb_key: string | null;
  photo_count: number;
  reservation_count: number;
};

@customElement("page-admin-items")
export class PageAdminItems extends LitElement {
  @state() private items: AdminItem[] = [];
  @state() private categories: Category[] = [];
  @state() private loading = true;
  @state() private q = "";
  // "all" | "none" | 카테고리 id 문자열
  @state() private categoryFilter = "all";
  @state() private createOpen = false;
  @state() private catOpen = false;
  // open 플래그와 바인딩용 모델을 분리 — 닫을 때 item 을 null 로 만들면
  // 다이얼로그가 flash 를 일으키므로 마지막 편집 대상을 남겨둔다.
  @state() private editOpen = false;
  @state() private editModel: Item | null = null;

  static styles = [
    rowsCss,
    css`
      :host {
        display: block;
      }
      .page-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }
      h1 {
        margin: 0;
        font-size: var(--text-heading-lg, 20px);
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        color: var(--color-text);
      }
      .sub {
        margin: 2px 0 0;
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .actions {
        display: flex;
        gap: var(--space-2, 8px);
        flex-shrink: 0;
      }
      .toolbar {
        display: flex;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
      }
      .toolbar input,
      .toolbar select {
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        color: var(--color-text);
        font-family: inherit;
        font-size: var(--text-body, 15px);
        box-sizing: border-box;
      }
      .toolbar input {
        flex: 1;
        min-width: 0;
      }
      .toolbar input:focus,
      .toolbar select:focus {
        outline: none;
        border-color: var(--color-primary);
      }
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
        color: var(--color-warning, #b45309);
      }
      .tag.retired {
        color: var(--color-danger);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    await this.reload();
  }

  private async reload() {
    try {
      const [itemsRes, catRes] = await Promise.all([
        api<{ items: AdminItem[] }>("/api/admin/items"),
        api<{ categories: Category[] }>("/api/categories"),
      ]);
      this.items = itemsRes.items;
      this.categories = catRes.categories;
    } catch {
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  private openEdit(it: AdminItem) {
    // 편집 다이얼로그 계약(Item)의 최소 형태 — 사진은 다이얼로그가 단건 조회로 채운다
    this.editModel = {
      id: it.id,
      name: it.name,
      status: it.status,
      total_qty: it.total_qty,
      kind: it.kind,
      location: it.location,
      description: it.description,
      category_id: it.category_id,
      photos: [],
    };
    this.editOpen = true;
  }

  private filtered(): AdminItem[] {
    const q = this.q.trim().toLowerCase();
    return this.items.filter((it) => {
      if (this.categoryFilter === "none") {
        if (it.category_id !== null) return false;
      } else if (this.categoryFilter !== "all") {
        if (String(it.category_id) !== this.categoryFilter) return false;
      }
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.location ?? "").toLowerCase().includes(q) ||
        (it.category_name ?? "").toLowerCase().includes(q)
      );
    });
  }

  render() {
    if (this.loading) {
      return html`<admin-nav active="items"></admin-nav><x-empty state="loading"></x-empty>`;
    }
    const list = this.filtered();
    return html`
      <div class="page-head">
        <div>
          <h1>물품 관리</h1>
          <p class="sub">
            전체 ${this.items.length}개 · 카테고리 ${this.categories.length}개
          </p>
        </div>
        <div class="actions">
          <x-button variant="secondary" size="sm" @click=${() => (this.catOpen = true)}>
            카테고리 관리
          </x-button>
          <x-button variant="primary" size="sm" @click=${() => (this.createOpen = true)}>
            + 물품 등록
          </x-button>
        </div>
      </div>
      <admin-nav active="items"></admin-nav>

      <div class="toolbar">
        <input
          type="search"
          placeholder="물품명, 위치, 카테고리"
          .value=${this.q}
          @input=${(e: Event) => (this.q = (e.target as HTMLInputElement).value)}
        />
        <select
          .value=${this.categoryFilter}
          @change=${(e: Event) => (this.categoryFilter = (e.target as HTMLSelectElement).value)}
        >
          <option value="all">카테고리 전체</option>
          ${this.categories.map(
            (c) => html`<option value=${String(c.id)} ?selected=${this.categoryFilter === String(c.id)}>
              ${c.name} (${c.item_count})
            </option>`,
          )}
          <option value="none" ?selected=${this.categoryFilter === "none"}>미지정</option>
        </select>
      </div>

      ${list.length === 0
        ? html`<x-empty text="조건에 맞는 물품이 없어요"></x-empty>`
        : html`
            <ul class="rows">
              ${list.map((it) => this.renderRow(it))}
            </ul>
          `}

      <item-create-dialog
        ?open=${this.createOpen}
        @close=${() => (this.createOpen = false)}
        @created=${() => {
          this.createOpen = false;
          void this.reload();
        }}
      ></item-create-dialog>

      <item-edit-dialog
        .item=${this.editModel ?? undefined}
        ?open=${this.editOpen}
        @close=${() => (this.editOpen = false)}
        @saved=${() => void this.reload()}
        @deleted=${() => void this.reload()}
      ></item-edit-dialog>

      <category-manage-dialog
        ?open=${this.catOpen}
        @close=${() => (this.catOpen = false)}
        @changed=${() => void this.reload()}
      ></category-manage-dialog>
    `;
  }

  private renderRow(it: AdminItem) {
    return html`
      <li class="row">
        <div class="thumb">
          ${it.thumb_key ? html`<img src="/api/photos/${it.thumb_key}" alt="" loading="lazy" />` : "📦"}
        </div>
        <div class="info">
          <div class="name">${it.name}</div>
          <div class="meta">
            ${it.category_name
              ? html`<span class="cat">${it.category_name}</span>`
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
        <x-button variant="secondary" size="sm" @click=${() => this.openEdit(it)}>수정</x-button>
      </li>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-items": PageAdminItems;
  }
}