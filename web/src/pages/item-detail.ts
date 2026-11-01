import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { type Item } from "../types";
import { reduceMotion } from "../styles/motion";
import { navigate } from "../router";
import { availableQty } from "../utils/stock";
import "../components/ui/badge";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/page-header";
import "../components/features/item/item-gallery";
import "../components/features/item/item-rental-form";

@customElement("page-item-detail")
export class PageItemDetail extends LitElement {
  @property() itemId = "";

  @state() private item: Item | null = null;
  @state() private loading = true;
  @state() private error = "";

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
        gap: var(--space-1);
        margin-bottom: var(--space-2);
      }

      /* 데스크톱은 사진 + 정보 2열, 좁은 화면은 한 열 */
      .content-col {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        gap: var(--space-3);
        align-items: start;
      }

      .info-col {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
      }

      /* 헤더 자체의 아래 여백은 info-col gap이 대신한다 */
      .info-col x-page-header {
        margin-bottom: 0;
      }

      .desc {
        font-size: var(--text-body);
        line-height: var(--line-height);
        color: var(--ink-2);
        margin: 0;
        white-space: pre-wrap;
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
      }

      .tag {
        display: inline-flex;
        align-items: center;
        height: 24px;
        padding: 0 var(--space-1);
        border: 0;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-fine);
      }

      .attrs {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: var(--space-1) var(--space-2);
        margin: 0;
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }

      dt {
        color: var(--ink-2);
        font-weight: 400;
      }

      dd {
        margin: 0;
        color: var(--ink-1);
      }

      @media (max-width: 899px) {
        .content-col {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--space-2);
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
    } catch (e) {
      if (gen !== this.loadGen) return;
      if (!quiet) this.error = e instanceof Error ? e.message : "물품 정보를 불러오지 못했어요";
    } finally {
      if (gen === this.loadGen && !quiet) this.loading = false;
    }
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  // 목록으로 돌아가기 — 이 앱 안에서 왔으면 히스토리 한 칸 뒤로, 새 탭·공유
  // 링크로 진입했으면(뒤로가기가 앱 밖으로 나가는 경우) 목록으로 직행한다
  private goBack() {
    if (window.history.state) {
      history.back();
      return;
    }
    navigate(location.search ? `/${location.search}` : "/");
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
      if ((it.qty_repair ?? 0) > 0) pairs.push(["수리중", `${it.qty_repair}개`]);
    }
    if (it.location) pairs.push(["보관 위치", it.location]);
    return pairs;
  }

  // 상단 바 — 왼쪽은 "되돌아가기"(이동), 오른쪽은 화면 액션(관리자 수정).
  // "취소"라는 라벨은 대여 신청을 취소하는 것처럼 읽혀서, 어디로 가는지
  // 이름이 드러나는 "목록으로"로 바꾼다
  private renderTopNav() {
    const it = this.item;
    return html`
      <div class="top-nav">
        <x-button variant="secondary" @click=${this.goBack}>
          목록으로
        </x-button>
        ${it && this.isAdmin
          ? html`
              <x-button
                variant="primary"
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
        <x-empty state="error" text=${this.error}></x-empty>
      `;
    }

    if (this.loading || !this.item) {
      return html`
        ${this.renderTopNav()}
        <x-empty state="loading"></x-empty>
      `;
    }

    const it = this.item;
    const attrs = this.attrPairs();

    return html`
      ${this.renderTopNav()}

      <div class="content-col">
        <item-gallery .photos=${it.photos} .name=${it.name}></item-gallery>

        <div class="info-col">
          <x-page-header title=${it.name}>
            ${it.availability_badge
              ? html`<x-badge slot="action" kind=${it.availability_badge}></x-badge>`
              : ""}
          </x-page-header>

          ${it.description ? html`<p class="desc">${it.description}</p>` : ""}
          ${it.categories?.length
            ? html`
                <div class="tags">
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
                    ([k, v]) => html`
                      <dt>${k}</dt>
                      <dd>${v}</dd>
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-item-detail": PageItemDetail;
  }
}
