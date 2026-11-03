import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import { navigate } from "../router";
import { availableQty } from "../utils/stock";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/features/item/item-gallery";
import "../components/features/item/item-rental-form";
import "../components/features/item/item-card";

@customElement("page-item-detail")
export class PageItemDetail extends LitElement {
  @property() itemId = "";

  @state() private item: Item | null = null;
  @state() private loading = true;
  @state() private error = "";
  @state() private related: Item[] = [];
  @state() private relatedCategory = "";

  // 로드 세대 — itemId가 빠르게 바뀌면(A→B 전환) 늦게 도착한 A의 응답이 B를 덮어쓰지 않게 한다
  private loadGen = 0;

  @state() private user: SessionUser | null = null;
  @state() private userReady = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }

      .top-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
      }

      /* 뒤로가기는 버튼이 아니라 이동 링크 — 시안처럼 조용한 텍스트 + 화살표 */
      .back {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 36px;
        color: var(--ink-2);
        text-decoration: none;
        font-size: var(--text-body);
        font-weight: 500;
      }
      .back svg {
        width: 16px;
        height: 16px;
      }
      .back:hover {
        color: var(--ink-1);
      }
      .back:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-radius: var(--radius);
      }

      /* 데스크톱은 사진 1.05fr + 정보 0.95fr, 1024px 이하는 한 열 */
      .content-col {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-3);
        align-items: start;
      }
      @media (min-width: 1024px) {
        .content-col {
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        }
      }

      .info-col {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1);
      }
      h1 {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-page-title);
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        line-height: 1.35;
      }
      .availability {
        display: inline-flex;
        align-items: center;
        height: 28px;
        padding: 0 12px;
        border-radius: var(--radius-pill);
        background: var(--surface-muted);
        color: var(--ink-2);
        font-size: var(--text-fine);
        font-weight: 500;
        white-space: nowrap;
      }
      .availability.available {
        background: var(--primary-soft);
        color: var(--primary-strong);
      }
      .availability.repair {
        background: var(--warning-soft);
        color: var(--warning);
      }

      .desc {
        margin: var(--space-2) 0 0;
        font-size: var(--text-body);
        line-height: var(--line-height);
        color: var(--ink-2);
        white-space: pre-wrap;
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
        margin-top: var(--space-2);
      }
      .tag {
        display: inline-flex;
        align-items: center;
        height: 28px;
        padding: 0 12px;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-fine);
      }

      /* 스펙은 카드 대신 헤어라인 표 — 정보가 먼저 읽힌다 */
      .attrs {
        margin: var(--space-3) 0 0;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }
      .attr-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--border);
      }
      .attr-row:last-child {
        border-bottom: 0;
      }
      dt {
        color: var(--ink-2);
        font-size: var(--text-fine);
        font-weight: 400;
      }
      dd {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-body);
        font-variant-numeric: tabular-nums;
      }
      .attr-row.strong dd {
        font-weight: 600;
      }

      item-rental-form {
        display: block;
        margin-top: var(--space-3);
      }

      /* ===== 같은 분류 ===== */
      .related {
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px solid var(--border);
      }
      .related-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .related-head h2 {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .related-head p {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .related-head a {
        color: var(--primary-strong);
        font-size: var(--text-body);
        font-weight: 500;
        text-decoration: none;
      }
      .related-head a:hover {
        color: var(--primary);
      }
      .related-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-1);
        margin-top: var(--space-2);
      }
      @media (min-width: 768px) {
        .related-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      /* 상세 로딩 — 실제 2열 골격을 그대로 쓴다 */
      .sk-media {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .sk-gallery {
        aspect-ratio: 4 / 3;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-muted);
        animation: pulse 1.4s ease-in-out infinite;
      }
      .sk-thumbs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-1);
      }
      .sk-thumb {
        aspect-ratio: 4 / 3;
        border-radius: var(--radius);
        background: var(--surface-muted);
        animation: pulse 1.4s ease-in-out infinite;
      }
      .sk-info {
        display: grid;
        align-content: start;
        gap: var(--space-2);
        padding-top: var(--space-1);
      }
      .sk-line {
        height: 14px;
        border-radius: 4px;
        background: var(--border);
        animation: pulse 1.4s ease-in-out infinite;
      }
      .sk-line.title {
        height: 28px;
        width: 60%;
      }
      .sk-line.wide {
        width: 90%;
      }
      .sk-line.mid {
        width: 70%;
      }
      .sk-line.short {
        width: 45%;
      }
      .sk-block {
        height: 120px;
        border-radius: var(--radius);
        background: var(--surface-muted);
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
    `,
  ];

  protected updated(changed: PropertyValues) {
    if (changed.has("itemId") && this.itemId) {
      void this.load();
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.userReady = true;
  }

  private async load(quiet = false) {
    const gen = ++this.loadGen;
    if (!quiet) this.loading = true;
    try {
      const res = await api<{ item: Item }>(`/api/items/${this.itemId}`);
      if (gen !== this.loadGen) return; // 다른 물품 로드가 시작됨 — 늦은 응답은 버린다
      this.item = res.item;
      this.error = "";
      void this.loadRelated(res.item, gen);
    } catch (e) {
      if (gen !== this.loadGen) return;
      if (!quiet) this.error = e instanceof Error ? e.message : "물품 정보를 불러오지 못했어요";
    } finally {
      if (gen === this.loadGen && !quiet) this.loading = false;
    }
  }

  // 같은 분류의 다른 물품 — 상세 하단의 다음 행동.
  // 목록 API(최대 60종)를 한 번 받아 분류가 같은 것만 4개까지 남긴다.
  // 검색 API를 쓰지 않아 의미 검색 비용·레이트 리밋을 건드리지 않는다.
  private async loadRelated(item: Item, gen: number) {
    const category = item.categories?.[0]?.name ?? "";
    this.relatedCategory = category;
    if (!category) {
      this.related = [];
      return;
    }
    try {
      const { items } = await api<{ items: Item[] }>("/api/items?limit=60");
      if (gen !== this.loadGen) return;
      this.related = items
        .filter(
          (x) =>
            x.id !== item.id &&
            (x.categories ?? []).some((c) => c.name === category),
        )
        .slice(0, 4);
    } catch {
      if (gen === this.loadGen) this.related = [];
    }
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  private get availableNow(): number {
    return this.item ? availableQty(this.item) : 0;
  }

  // 정보 행 — 재고/구분/위치를 하나의 dl 그리드로 통일
  private attrPairs(): [string, string][] {
    const it = this.item;
    if (!it) return [];
    const pairs: [string, string][] = [];
    if (it.kind === "consumable") {
      pairs.push(["보유 수량", `${it.total_qty}개`]);
      pairs.push(["구분", "소모품"]);
    } else {
      pairs.push(["대여 가능", `${this.availableNow}개`]);
      pairs.push(["전체 보유", `${it.total_qty}개`]);
      if ((it.qty_repair ?? 0) > 0) pairs.push(["수리 중", `${it.qty_repair}개`]);
    }
    if (it.location) pairs.push(["보관 위치", it.location]);
    return pairs;
  }

  private availabilityText(it: Item): string {
    if (it.availability_badge === "available") return `대여 가능 ${this.availableNow}개`;
    if (it.availability_badge === "repair") return "수리 중";
    if (it.availability_badge === "retired") return "폐기";
    if (it.availability_badge === "rented") return "대여 중";
    return "";
  }

  private renderTopNav() {
    const it = this.item;
    return html`
      <div class="top-nav">
        <a class="back" href=${location.search ? `/${location.search}` : "/"}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          목록으로
        </a>
        ${it && this.isAdmin
          ? html`
              <x-button
                variant="secondary"
                @click=${() => navigate(`/items/${it.id}/edit`)}
              >
                수정
              </x-button>
            `
          : ""}
      </div>
    `;
  }

  render() {
    if (this.error) {
      return html`
        ${this.renderTopNav()}
        <x-empty
          state="error"
          text=${this.error}
          subtitle="삭제되었거나 연결이 불안정해요."
        >
          <x-button variant="primary" @click=${() => void this.load()}>
            다시 시도
          </x-button>
          <x-button variant="secondary" @click=${() => navigate("/")}>
            목록으로
          </x-button>
        </x-empty>
      `;
    }

    if (this.loading || !this.item) {
      return html`
        ${this.renderTopNav()}
        <div class="content-col" role="status" aria-label="물품 정보를 불러오는 중">
          <div class="sk-media" aria-hidden="true">
            <div class="sk-gallery"></div>
            <div class="sk-thumbs">
              <div class="sk-thumb"></div>
              <div class="sk-thumb"></div>
              <div class="sk-thumb"></div>
            </div>
          </div>
          <div class="sk-info" aria-hidden="true">
            <div class="sk-line title"></div>
            <div class="sk-line wide"></div>
            <div class="sk-line mid"></div>
            <div class="sk-line short"></div>
            <div class="sk-block"></div>
          </div>
        </div>
      `;
    }

    const it = this.item;
    const attrs = this.attrPairs();
    const availability = this.availabilityText(it);

    return html`
      ${this.renderTopNav()}

      <div class="content-col">
        <item-gallery .photos=${it.photos} .name=${it.name}></item-gallery>

        <div class="info-col">
          <div class="title-row">
            <h1>${it.name}</h1>
            ${availability
              ? html`<span class="availability ${it.availability_badge}"
                  >${availability}</span
                >`
              : ""}
          </div>

          ${it.description ? html`<p class="desc">${it.description}</p>` : ""}
          ${it.categories?.length
            ? html`
                <div class="tags" aria-label="분류">
                  ${it.categories.map(
                    (c) => html`<span class="tag">#${c.name}</span>`,
                  )}
                </div>
              `
            : ""}
          ${attrs.length > 0
            ? html`
                <dl class="attrs">
                  ${attrs.map(
                    ([k, v], i) => html`
                      <div class="attr-row ${i === 0 ? "strong" : ""}">
                        <dt>${k}</dt>
                        <dd>${v}</dd>
                      </div>
                    `,
                  )}
                </dl>
              `
            : ""}

          <item-rental-form
            .item=${it}
            .user=${this.user}
            .userReady=${this.userReady}
            @rented=${() => void this.load(true)}
          ></item-rental-form>
        </div>
      </div>

      ${this.related.length > 0
        ? html`
            <section class="related">
              <div class="related-head">
                <div>
                  <h2>${this.relatedCategory} 물품 더 보기</h2>
                  <p>함께 쓰면 좋은 물품이에요</p>
                </div>
                <a href="/">전체 보기</a>
              </div>
              <div class="related-grid" role="list">
                ${this.related.map(
                  (r) => html`<item-card
                    role="listitem"
                    .item=${r}
                    href=${`/items/${r.id}`}
                  ></item-card>`,
                )}
              </div>
            </section>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-item-detail": PageItemDetail;
  }
}
