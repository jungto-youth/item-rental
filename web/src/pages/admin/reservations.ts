import { LitElement, html, css } from "lit";
import { confirmDialog } from "../../utils/confirm";
import { fmtKstDate } from "../../utils/date";
import { customElement, state } from "lit/decorators.js";
import "../../components/ui/badge";
import type { AdminReservation, ReservationStatus } from "../../types";
import { api } from "../../api/client";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-page";
import "../../components/ui/empty";
import "../../components/ui/select";
import { rowsCss } from "../../components/ui/rows";

// 대여 관리: 반납 처리만 (admin 전용)
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
  @state() private error = "";

  static styles = [
    reduceMotion,
    rowsCss,
    css`
      .bar {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }
      .bar label {
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      /* 회원이 직접 반납한 건 — 자기 신고라 관리자가 물품을 확인해야 한다 */
      .by {
        color: var(--tone-warning-text);
        font-size: var(--text-fine);
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
    this.error = "";
    try {
      const qs = this.filter ? `?status=${this.filter}` : "";
      const res = await api<{
        reservations: AdminReservation[];
        truncated?: boolean;
      }>(`/api/admin/reservations${qs}`);
      this.reservations = res.reservations;
      this.truncated = res.truncated === true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "대여 목록을 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  // 반납 처리 — 이 화면의 유일한 상태 전이
  private async markReturned(r: AdminReservation) {
    if (this.busy) return;
    const label = r.qty > 1 ? `'${r.item_name}' ${r.qty}개` : `'${r.item_name}'`;
    if (!(await confirmDialog(`${label}를 반납 처리할까요?`, { confirmLabel: "반납 처리", danger: false }))) return;
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
      <admin-page
        active="reservations"
        title="대여 관리"
        ?loading=${this.loading}
        .error=${this.error}
        .message=${this.message}
        @retry=${() => void this.reload()}
      >
        <div class="bar" slot="toolbar">
          <label for="filter-status">상태</label>
          <x-select
            id="filter-status"
            .value=${this.filter}
            .options=${[
          { value: "", label: "전체" },
          { value: "rented", label: "대여 중" },
          { value: "returned", label: "반납 완료" },
          { value: "cancelled", label: "취소" },
        ]}
            @change=${(e: CustomEvent<{ value: string }>) => {
          this.filter = e.detail.value as "" | ReservationStatus;
          void this.reload();
        }}
          ></x-select>
        </div>
        ${this.reservations.length === 0
          ? html`<x-empty compact state="empty" text="대여가 없어요"></x-empty>`
          : html`${this.truncated ? html`<x-empty compact state="empty" text="500건까지만 표시 — 오래된 건은 잘릴 수 있어요"></x-empty>` : ""}${this.renderCards()}`
        }
      </admin-page>
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
        <span class="meta"
          >${r.member_name || "—"} · ${r.member_phone ?? r.member_email} ·
          ${fmtKstDate(r.created_at)}</span
        >
        ${r.returned_by_member
        ? html`<span class="by"
                >회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요</span
              >`
        : r.status === "returned" && r.admin_name
          ? html`<span class="meta">${r.admin_name} 관리자가 반납 처리</span>`
          : ""
      }
        ${r.member_memo ? html`<span class="meta">메모 · ${r.member_memo}</span>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-reservations": PageAdminReservations;
  }
}
