import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../components/ui/badge";
import type { AdminReservation, ReservationStatus } from "../../types";
import { api } from "../../api/client";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-nav";

// SPEC §4.3 — 대여 관리: 반납 처리만 (admin 전용)
// 승인·거절·수령이 없어졌다 — 회원이 신청하면 즉시 대여 중이고, 관리자는 돌려받았을 때 반납을 누른다
@customElement("page-admin-reservations")
export class PageAdminReservations extends LitElement {
  @state() private reservations: AdminReservation[] = [];
  // 500건 하드 리밋으로 잘렸는지 — 잘렸으면 '500건까지만 표시' 안내
  @state() private truncated = false;
  @state() private filter: "" | ReservationStatus = "";
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private busy = false;
  @state() private message = "";

  static styles = [
    reduceMotion,
    css`
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .bar label {
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      select {
        height: 36px;
        padding: 0 var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: var(--text-caption);
        font-family: inherit;
      }
      /* 표 대신 두 줄 로우 — 640px 본문에 테이블이 원래 안 맞아 좌우 스크롤로 처리 버튼이 가려짐 */
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
        min-height: 44px;
      }
      .name {
        font-weight: 600;
        font-size: var(--text-body);
        letter-spacing: var(--tracking-tight);
        flex: 1;
        min-width: 0;
      }
      .head x-badge {
        flex-shrink: 0;
      }
      .who,
      .memo {
        color: var(--color-muted);
      }
      /* 회원이 직접 반납한 건 — 자기 신고라 관리자가 물품을 확인해야 한다 */
      .by {
        color: var(--color-warning);
        font-size: var(--text-fine);
      }
      .link {
        background: none;
        border: 0;
        color: var(--color-primary);
        cursor: pointer;
        padding: var(--space-2);
        font-size: var(--text-caption);
        font-family: inherit;
      }
      .link:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .head .link {
        flex-shrink: 0;
      } /* 액션 링크가 눌리지 않게 — 44px 터치 타깃 유지 */
      .msg {
        color: var(--color-primary);
        font-size: var(--text-caption);
        min-height: 1.2em;
      }
      .empty {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    // 대시보드 카드 딥링크(?status=…) — 유효한 상태면 필터 미리 적용
    const qs = new URLSearchParams(location.search).get("status");
    if (qs && ["rented", "returned", "cancelled"].includes(qs)) {
      this.filter = qs as ReservationStatus;
    }
    await this.reload();
  }

  private async reload() {
    try {
      const qs = this.filter ? `?status=${this.filter}` : "";
      const res = await api<{
        reservations: AdminReservation[];
        truncated?: boolean;
      }>(`/api/admin/reservations${qs}`);
      this.reservations = res.reservations;
      this.truncated = res.truncated === true;
    } catch (e) {
      this.message = e instanceof Error ? e.message : "오류";
    } finally {
      this.loading = false;
    }
  }

  // 반납 처리 — 이 화면의 유일한 상태 전이
  private async markReturned(r: AdminReservation) {
    if (this.busy) return;
    const label = r.qty > 1 ? `'${r.item_name}' ${r.qty}개` : `'${r.item_name}'`;
    if (!confirm(`${label}를 반납 처리할까요?`)) return;
    this.busy = true;
    try {
      await api(`/api/admin/reservations/${r.id}/return`, { method: "POST" });
      this.message = "반납 처리했어요";
      await this.reload();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "처리에 실패했어요";
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <admin-nav active="reservations"></admin-nav>
      <h1>대여 관리</h1>
      <div class="bar">
        <label for="filter-status">상태</label>
        <select
          id="filter-status"
          .value=${this.filter}
          @change=${(e: Event) => {
            this.filter = (e.target as HTMLSelectElement).value as
              | ""
              | ReservationStatus;
            void this.reload();
          }}
        >
          <option value="" ?selected=${this.filter === ""}>전체</option>
          <option value="rented" ?selected=${this.filter === "rented"}>
            대여 중
          </option>
          <option value="returned" ?selected=${this.filter === "returned"}>
            반납 완료
          </option>
          <option value="cancelled" ?selected=${this.filter === "cancelled"}>
            취소
          </option>
        </select>
      </div>
      <p class="msg" aria-live="polite">${this.message}</p>
      ${
        this.loading
          ? html`<p class="empty">불러오는 중…</p>`
          : this.reservations.length === 0
            ? html`<p class="empty">대여가 없어요</p>`
            : html`${this.truncated ? html`<p class="empty">500건까지만 표시 — 오래된 건은 잘릴 수 있어요</p>` : ""}${this.renderCards()}`
      }
    `;
  }

  private renderCards() {
    return html`
      <div class="rows">
        ${this.reservations.map((r) => this.renderCard(r))}
      </div>
    `;
  }

  private renderCard(r: AdminReservation) {
    const acts =
      r.status === "rented"
        ? html`<button
            class="link"
            ?disabled=${this.busy}
            @click=${() => this.markReturned(r)}
          >
            반납
          </button>`
        : "";
    return html`
      <div class="row">
        <span class="head">
          <span class="name"
            >${r.item_name}${r.qty > 1 ? ` · ${r.qty}개` : ""}</span
          >
          <x-badge kind=${r.status}></x-badge>
          ${acts}
        </span>
        <span class="who"
          >${r.member_name || "—"} · ${r.member_phone ?? r.member_email} ·
          ${r.created_at.slice(0, 10)}</span
        >
        ${
          r.returned_by_member
            ? html`<span class="by"
                >회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요</span
              >`
            : r.status === "returned" && r.admin_name
              ? html`<span class="memo">${r.admin_name} 관리자가 반납 처리</span>`
              : ""
        }
        ${r.member_memo ? html`<span class="memo">메모 · ${r.member_memo}</span>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-reservations": PageAdminReservations;
  }
}
