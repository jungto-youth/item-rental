import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../../api/client";
import { navigate } from "../../router";
import type { RentalHistoryRow } from "../../types";
import { reduceMotion } from "../../styles/motion";

// SPEC §4.3 — 과거 대여 이력 (2025 청년페스타 '물품대여' 시트 스냅샷, 관리자 전용)
// 살아 있는 운영 큐(/admin/reservations)와 다른 자료다 — 수정·상태 전이가 없고 조회만 한다.
// 시트에 상품 ID 가 없어 물품명이 유일한 연결고리라, 검색은 이름 문자열 기준이다.
const LIMIT = 50;

// timestamp 문자열('YYYY-MM-DD HH:MM:SS')에서 분까지만 — 초는 의미가 없다
function stamp(s: string | null): string {
  return s ? s.slice(0, 16) : "";
}

// 같은 날이면 날짜를 한 번만 — '2025-11-08 00:00 ~ 2025-11-08 10:30' 은 길기만 하다
function period(start: string | null, end: string | null): string {
  if (!start || !end) return stamp(start ?? end);
  if (start.slice(0, 10) === end.slice(0, 10)) {
    return `${start.slice(0, 10)} ${start.slice(11, 16)}~${end.slice(11, 16)}`;
  }
  return `${stamp(start)} ~ ${stamp(end)}`;
}

@customElement("page-admin-history")
export class PageAdminHistory extends LitElement {
  @state() private rows: RentalHistoryRow[] = [];
  @state() private total = 0;
  @state() private page = 1;
  @state() private q = "";
  @state() private scope = "";
  @state() private loading = true;
  @state() private loadingMore = false;
  @state() private message = "";
  // 검색어 디바운스 — 한 글자마다 API 를 부르지 않는다 (타이머는 해제 시 정리)
  private timer: number | null = null;

  static styles = [
    reduceMotion,
    css`
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      /* 표 대신 두 줄 로우 — 대여 관리와 같은 이유: 표는 좌우 스크롤로 내용을 가림 (§4.4) */
      .bar {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      input[type="search"],
      select {
        height: 36px;
        padding: 0 var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: var(--text-caption);
        font-family: inherit;
      }
      input[type="search"] {
        flex: 1;
        min-width: 160px;
      }
      .count {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .rows {
        display: grid;
      }
      .row {
        border-bottom: 1px solid var(--color-border);
        padding: var(--space-2) 0;
        display: grid;
        gap: var(--space-1);
        font-size: var(--text-caption);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .name {
        font-weight: 600;
        font-size: var(--text-body);
        letter-spacing: var(--tracking-tight);
        flex: 1;
        min-width: 0;
      }
      .who,
      .when,
      .memo {
        color: var(--color-muted);
      }
      .link {
        background: none;
        border: 0;
        color: var(--color-primary);
        cursor: pointer;
        padding: var(--space-2);
        font-size: var(--text-caption);
        font-family: inherit;
        flex-shrink: 0;
      }
      .msg {
        color: var(--tone-danger-text);
        font-size: var(--text-caption);
        min-height: 1.2em;
      }
      .empty {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .more {
        display: block;
        width: 100%;
        height: 44px;
        margin-top: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-bg);
        color: var(--color-text);
        font-family: inherit;
        font-size: var(--text-caption);
        cursor: pointer;
      }
      .more[disabled] {
        color: var(--color-muted);
        cursor: default;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    await this.reload();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer !== null) clearTimeout(this.timer);
  }

  // append=false 는 조건 변경(1페이지부터), true 는 '더 보기'(이어붙임)
  private async reload(append = false) {
    if (append) this.loadingMore = true;
    else {
      this.page = 1;
      this.loading = true;
    }
    try {
      const params = new URLSearchParams({
        page: String(this.page),
        limit: String(LIMIT),
      });
      if (this.q) params.set("q", this.q);
      if (this.scope) params.set("scope", this.scope);
      const res = await api<{ rows: RentalHistoryRow[]; total: number }>(
        `/api/admin/history?${params}`,
      );
      this.rows = append ? [...this.rows, ...res.rows] : res.rows;
      this.total = res.total;
      // 조건이 바뀌어 결과가 줄어든 경우 — 로딩 중 안내를 지운다
      this.message = "";
    } catch (e) {
      // '더 보기'가 실패하면 페이지를 되돌린다 — 그대로 두면 재시도 때 한 페이지를 건너뛴다
      if (append) this.page -= 1;
      this.message = e instanceof Error ? e.message : "오류";
    } finally {
      this.loading = false;
      this.loadingMore = false;
    }
  }

  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value.trim();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.reload(), 250);
  }

  private onScope(e: Event) {
    this.scope = (e.target as HTMLSelectElement).value;
    // 검색 디바운스가 살아 있으면 250ms 뒤 같은 조건으로 한 번 더 조회한다
    if (this.timer !== null) clearTimeout(this.timer);
    void this.reload();
  }

  private more() {
    this.page += 1;
    void this.reload(true);
  }

  render() {
    return html`
      <h1>대여 이력</h1>
      <p class="count">
        2025 청년페스타 시트 기록이에요 — 지난 대여를 찾아볼 때 쓰는 참고
        자료이고, 예약 처리에는 관여하지 않아요.
      </p>
      <div class="bar">
        <input
          type="search"
          placeholder="물품명·신청자·소속 검색"
          aria-label="물품명·신청자·소속 검색"
          .value=${this.q}
          @input=${this.onSearch}
        />
        <select .value=${this.scope} aria-label="구분" @change=${this.onScope}>
          <option value="" ?selected=${this.scope === ""}>전체 구분</option>
          <option value="청년물품" ?selected=${this.scope === "청년물품"}>
            청년물품
          </option>
          <option value="회관물품" ?selected=${this.scope === "회관물품"}>
            회관물품
          </option>
        </select>
        <span class="count" role="status"
          >${this.loading ? "" : `총 ${this.total}건`}</span
        >
      </div>
      <p class="msg" aria-live="polite">${this.message}</p>
      ${
        this.loading
          ? html`<p class="empty">불러오는 중…</p>`
          : this.rows.length === 0
            ? html`<p class="empty">조건에 맞는 이력이 없어요</p>`
            : this.renderRows()
      }
    `;
  }

  private renderRows() {
    return html`
      <div class="rows">${this.rows.map((r) => this.renderRow(r))}</div>
      ${
        this.rows.length < this.total
          ? html`<button
              class="more"
              ?disabled=${this.loadingMore}
              @click=${() => this.more()}
            >
              ${this.loadingMore ? "불러오는 중…" : `더 보기 (${this.total - this.rows.length}건 남음)`}
            </button>`
          : ""
      }
    `;
  }

  private renderRow(r: RentalHistoryRow) {
    // 시트에서 상품 ID 를 못 채운 건이 대부분이라(216건 중 10건) 연결된 것만 링크를 준다
    const use = period(r.start_at, r.end_at);
    const who = [r.item_scope, r.member_name, r.org]
      .filter(Boolean)
      .join(" · ");
    const when = [
      r.requested_on ? `신청 ${r.requested_on}` : "신청일 미상",
      use ? `사용 ${use}` : "",
      r.use_location ?? "",
      r.qty ? `수량 ${r.qty}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return html`
      <div class="row">
        <span class="head">
          <span class="name">${r.item_name}</span>
          ${
            r.item_id
              ? html`<button
                  class="link"
                  @click=${() => navigate(`/items/${r.item_id}`)}
                >
                  물품 보기
                </button>`
              : ""
          }
        </span>
        <span class="who">${who}</span>
        <span class="when">${when}</span>
        ${r.note ? html`<span class="memo">비고 · ${r.note}</span>` : ""}
        ${r.checkout_state ? html`<span class="memo">출고 · ${r.checkout_state}</span>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-history": PageAdminHistory;
  }
}
