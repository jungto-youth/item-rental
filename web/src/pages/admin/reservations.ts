import { LitElement, html, css } from "lit";
import { confirmDialog } from "../../utils/confirm";
import { fmtKstDate } from "../../utils/date";
import { customElement, state } from "lit/decorators.js";
import type { AdminReservation, ReservationStatus } from "../../types";
import { api } from "../../api/client";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-page";
import "../../components/ui/empty";
import "../../components/ui/button";
import "../../components/ui/chip";
import "../../components/common/reservation-row";

type Filter = "" | ReservationStatus;

// 대여 관리: 반납 처리만 (admin 전용)
// 승인·거절·수령이 없어졌다 — 회원이 신청하면 즉시 대여 중이고, 관리자는 돌려받았을 때 반납을 누른다
@customElement("page-admin-reservations")
export class PageAdminReservations extends LitElement {
  // 전체를 받아 두고 필터·칩 숫자를 클라이언트에서 계산한다 (시안의 칩 카운트)
  @state() private reservations: AdminReservation[] = [];
  // 500건 하드 리밋으로 잘렸는지 — 잘렸으면 '500건까지만 표시' 안내
  @state() private truncated = false;
  @state() private filter: Filter = "";
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  // 반납 처리 중인 예약 id — 해당 행 버튼만 스피너를 띄운다
  @state() private processingId: number | null = null;
  @state() private message = "";
  // 성공/실패 구분 — 실패 문구가 성공과 같은 파란색으로 나오면 안 된다
  @state() private messageTone: "info" | "success" | "error" = "info";
  @state() private error = "";

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
        max-width: 840px;
        margin: 0 auto;
      }
      x-chip {
        display: block;
        margin-top: var(--space-3);
      }
      .result {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin: var(--space-2) 0 var(--space-1);
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .result p {
        margin: 0;
      }
      .trunc {
        color: var(--danger);
      }
      .tel {
        color: var(--ink-1);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .tel:hover {
        text-decoration: underline;
      }
      .list {
        display: grid;
        gap: var(--space-1);
        margin-top: var(--space-1);
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
    // 필터 전환 재조회도 로딩을 보여준다 — 안 하면 옛 목록이 그대로 있다가 조용히
    // 바뀌어, 느린 네트워크에서 "먹힌" 것처럼 보인다
    this.loading = true;
    try {
      const res = await api<{
        reservations: AdminReservation[];
        truncated?: boolean;
      }>("/api/admin/reservations");
      this.reservations = res.reservations;
      this.truncated = res.truncated === true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "대여 목록을 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  // 상태 필터 전환 — 서버 재조회 없이 이미 받은 목록을 거른다
  private setFilter(v: string) {
    this.filter = v as Filter;
  }

  private get filtered(): AdminReservation[] {
    if (!this.filter) return this.reservations;
    return this.reservations.filter((r) => r.status === this.filter);
  }

  private countFor(status: Filter): number {
    if (!status) return this.reservations.length;
    return this.reservations.filter((r) => r.status === status).length;
  }

  // 반납 처리 — 이 화면의 유일한 상태 전이
  private async markReturned(r: AdminReservation) {
    if (this.processingId !== null) return;
    const label = r.qty > 1 ? `'${r.item_name}' ${r.qty}개` : `'${r.item_name}'`;
    if (!(await confirmDialog(`${label}를 반납 처리할까요?`, { confirmLabel: "반납 처리" })))
      return;
    this.processingId = r.id;
    try {
      await api(`/api/admin/reservations/${r.id}/return`, { method: "POST" });
      this.message = "반납 처리했어요";
      this.messageTone = "success";
      await this.reload();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "처리에 실패했어요";
      this.messageTone = "error";
      await this.reload();
    } finally {
      this.processingId = null;
    }
  }

  render() {
    const list = this.filtered;
    return html`
      <admin-page
        title="대여 관리"
        subtitle="회원이 빌린 물품과 반납 상태를 확인해요."
        ?loading=${this.loading}
        .error=${this.error}
        .message=${this.message}
        .messageTone=${this.messageTone}
        @retry=${() => void this.reload()}
      >
        <x-chip
          layout="grid"
          ariaLabel="상태 필터"
          .value=${this.filter}
          .options=${[
            { value: "", label: "전체", count: this.countFor("") },
            { value: "rented", label: "대여 중", count: this.countFor("rented") },
            { value: "returned", label: "반납 완료", count: this.countFor("returned") },
            { value: "cancelled", label: "취소", count: this.countFor("cancelled") },
          ]}
          @change=${(e: CustomEvent<{ value: string }>) => this.setFilter(e.detail.value)}
        ></x-chip>

        ${list.length === 0
          ? html`<div class="list">
              <x-empty
                state="empty"
                text=${this.filter ? "해당 상태의 대여가 없어요" : "대여가 없어요"}
                subtitle=${this.filter ? "다른 상태를 선택해 보세요." : ""}
              ></x-empty>
            </div>`
          : html`
              <div class="result">
                <p role="status">
                  ${list.length}개
                  ${this.truncated
                    ? html` <span class="trunc">(500건까지만 표시 — 더 오래된 건은 여기 없어요)</span>`
                    : ""}
                </p>
                <p>최근 대여 순</p>
              </div>
              <div class="list">
                ${list.map((r) => this.renderCard(r))}
              </div>
            `}
      </admin-page>
    `;
  }

  private renderCard(r: AdminReservation) {
    // 처리 중인 건만 스피너를 보여준다 — 목록 전체가 함께 비활성화되면 어느 건이
    // 걸려 있는지 알 수 없다
    const processing = this.processingId === r.id;
    return html`
      <reservation-row
        .title=${`${r.item_name} · ${r.qty}개`}
        badgeKind=${r.status}
        ?active=${r.status === "rented"}
      >
        ${r.status === "rented"
          ? html`<x-button
              slot="actions"
              variant="secondary"
              ?loading=${processing}
              ?disabled=${this.processingId !== null && !processing}
              @click=${() => this.markReturned(r)}
            >
              반납
            </x-button>`
          : ""}
        ${this.contactLine(r)}
        <span>
          ${fmtKstDate(r.created_at)} 대여${r.status === "returned"
            ? ` → ${fmtKstDate(r.updated_at)} 반납`
            : ""}
          ${r.status === "returned" && r.admin_name ? ` · ${r.admin_name} 처리` : ""}
        </span>
        ${r.returned_by_member
          ? html`<span class="warn"
              >회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요</span
            >`
          : ""}
        ${r.member_memo ? html`<span>메모 · ${r.member_memo}</span>` : ""}
      </reservation-row>
    `;
  }

  // 연락처 줄 — 전화번호는 탭하면 바로 걸 수 있게 tel: 링크로
  private contactLine(r: AdminReservation) {
    const phone = r.member_phone;
    const contact = phone
      ? html`<a class="tel" href="tel:${phone.replace(/[^+\d]/g, "")}">${phone}</a>`
      : (r.member_email || "연락처 미등록");
    return html`<span>${r.member_name || "—"} · ${contact}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-reservations": PageAdminReservations;
  }
}
