import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { fmtKstDate } from "../utils/date";
import { confirmDialog } from "../utils/confirm";
import { session } from "../context/session";
import { navigate } from "../router";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/page-header";
import "../components/common/reservation-row";
import type { MyReservation } from "../types";
import { reduceMotion } from "../styles/motion";

// 대여 내역 페이지: 현재 대여 중 + 대여 이력 + 반납·취소
@customElement("page-my-rentals")
export class PageMyRentals extends LitElement {
  @state() private loading = true;
  @state() private reservations: MyReservation[] = [];
  @state() private message = "";
  // 성공/실패 구분 — "취소 실패"가 "취소했어요"와 같은 파란색으로 나오면 안 된다
  @state() private messageTone: "info" | "success" | "error" = "info";
  // 반납·취소 처리 중인 예약 — 어느 행이, 어느 동작이 걸려 있는지 알아야
  // 그 행의 그 버튼에만 스피너를 띄울 수 있다
  @state() private processing: { id: number; kind: "return" | "cancel" } | null =
    null;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }

      .msg {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: var(--space-1) 0 0;
        color: var(--ink-1);
        font-size: var(--text-fine);
        min-height: 1.2em;
      }
      .msg svg {
        width: 16px;
        height: 16px;
        flex: none;
        color: var(--primary-strong);
      }
      .msg.error {
        color: var(--danger);
      }
      .msg.error svg {
        color: var(--danger);
      }

      section {
        margin-top: var(--space-3);
      }
      h2 {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .list {
        display: grid;
        gap: var(--space-1);
        margin-top: var(--space-2);
      }

      /* 현재 대여가 없을 때 — 다음 행동을 카드 안에 남긴다 */
      .empty-card {
        margin-top: var(--space-2);
        padding: var(--space-5) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        text-align: center;
        box-sizing: border-box;
      }
      .empty-card p {
        margin: 0;
      }
      .empty-title {
        color: var(--ink-1);
        font-size: var(--text-body);
        font-weight: 600;
      }
      .empty-sub {
        margin-top: var(--space-1) !important;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .empty-card x-button {
        display: inline-block;
        margin-top: var(--space-2);
      }

      details {
        margin-top: var(--space-4);
      }
      summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-1) 0;
        color: var(--ink-1);
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        cursor: pointer;
        list-style: none;
        user-select: none;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      summary svg {
        width: 20px;
        height: 20px;
        flex: none;
        color: var(--ink-2);
        transition: transform 0.15s ease;
      }
      details[open] summary svg {
        transform: rotate(180deg);
      }
      .history-list {
        display: grid;
        gap: var(--space-1);
        margin-top: var(--space-2);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    const user = await session.ensure();
    this.loading = false;
    if (user) await this.loadReservations();
  }

  private async loadReservations() {
    try {
      const res = await api<{ reservations: MyReservation[] }>(
        "/api/reservations/mine",
      );
      this.reservations = res.reservations;
    } catch (e) {
      this.message = e instanceof Error ? e.message : "대여 내역을 불러오지 못했어요";
      this.messageTone = "error";
    }
  }

  private async doCancel(r: MyReservation) {
    if (this.processing) return;
    this.processing = { id: r.id, kind: "cancel" };
    try {
      await api(`/api/reservations/${r.id}/cancel`, { method: "POST" });
      this.message = `${r.item_name} 대여를 취소했어요`;
      this.messageTone = "success";
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "취소하지 못했어요";
      this.messageTone = "error";
    } finally {
      this.processing = null;
    }
  }

  private async doReturn(r: MyReservation) {
    if (this.processing) return;
    this.processing = { id: r.id, kind: "return" };
    try {
      await api(`/api/reservations/${r.id}/return`, { method: "POST" });
      this.message = `${r.item_name} 반납 완료 처리되었어요`;
      this.messageTone = "success";
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "반납 처리하지 못했어요";
      this.messageTone = "error";
    } finally {
      this.processing = null;
    }
  }

  // 확인은 다른 화면과 같은 confirmDialog(모달)로 — 반납·취소는 되돌릴 수 있거나
  // 자기 신고라 위험 동작이 아니므로 확인 버튼은 기본(primary) 톤을 쓴다
  private async onReturn(r: MyReservation) {
    // 처리 중 확인은 다이얼로그보다 먼저 — 뒤에 두면 연타로 다이얼로그가 두 개 열린다
    if (this.processing) return;
    if (
      !(await confirmDialog(`'${r.item_name}'를 반납할까요?`, {
        confirmLabel: "반납",
      }))
    )
      return;
    await this.doReturn(r);
  }

  private async onCancel(r: MyReservation) {
    if (this.processing) return;
    if (
      !(await confirmDialog(`'${r.item_name}' 대여를 취소할까요?`, {
        confirmLabel: "대여 취소",
      }))
    )
      return;
    await this.doCancel(r);
  }

  private renderActiveRow(r: MyReservation) {
    // 처리 중인 건만 스피너 — 목록 전체가 함께 잠기면 어느 건이 걸렸는지 모른다
    const mine = this.processing?.id === r.id;
    const blocked = this.processing !== null && !mine;
    return html`
      <reservation-row active title="${r.item_name} · ${r.qty}개">
        <x-button
          slot="actions"
          variant="primary"
          ?loading=${mine && this.processing?.kind === "return"}
          ?disabled=${blocked}
          @click=${() => this.onReturn(r)}
        >
          반납하기
        </x-button>
        <x-button
          slot="actions"
          variant="secondary"
          ?loading=${mine && this.processing?.kind === "cancel"}
          ?disabled=${blocked}
          @click=${() => this.onCancel(r)}
        >
          취소
        </x-button>
        <span>${fmtKstDate(r.created_at)} 대여 신청</span>
        ${r.member_memo ? html`<span>메모: ${r.member_memo}</span>` : ""}
      </reservation-row>
    `;
  }

  private renderHistoryRow(r: MyReservation) {
    return html`
      <reservation-row
        title="${r.item_name} · ${r.qty}개"
        badgeKind=${r.status}
      >
        <span>
          ${fmtKstDate(r.created_at)} 대여${r.status === "returned" ? html` → ${fmtKstDate(r.updated_at)} 반납` : ""}
        </span>
        ${r.member_memo ? html`<span>메모: ${r.member_memo}</span>` : ""}
      </reservation-row>
    `;
  }

  render() {
    if (this.loading) return html`<x-empty state="loading"></x-empty>`;
    // 방어적 분기 — 라우트 가드가 /login 으로 보내지만, 세션이 그 사이 만료되면
    // "로그인이 필요해요"만으로는 사용자가 갈 곳을 알 수 없다
    if (!session.user)
      return html`
        <x-empty state="empty" text="로그인이 필요해요">
          <x-button variant="primary" @click=${() => navigate("/login")}>
            로그인
          </x-button>
        </x-empty>
      `;

    const rentedList = this.reservations.filter((r) => r.status === "rented");
    const historyList = this.reservations.filter(
      (r) => r.status === "returned" || r.status === "cancelled",
    );

    return html`
      <x-page-header
        title="대여 내역"
        subtitle="지금 빌린 물품과 지난 기록을 확인해요."
      ></x-page-header>

      ${this.message
        ? html`<p
            class="msg ${this.messageTone}"
            role=${this.messageTone === "error" ? "alert" : "status"}
          >
            ${this.messageTone === "success"
              ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>`
              : ""}
            <span>${this.message}</span>
          </p>`
        : ""}

      <!-- 1순위: 현재 대여 중인 물품 -->
      <section>
        <h2>현재 대여 중 (${rentedList.length})</h2>
        ${rentedList.length > 0
          ? html`<div class="list">
              ${rentedList.map((r) => this.renderActiveRow(r))}
            </div>`
          : html`
              <div class="empty-card">
                <p class="empty-title">현재 대여 중인 물품이 없어요</p>
                <p class="empty-sub">필요한 물품을 찾아 바로 대여할 수 있어요.</p>
                <x-button variant="secondary" @click=${() => navigate("/")}>
                  물품 둘러보기
                </x-button>
              </div>
            `}
      </section>

      <!-- 2순위: 과거 대여 이력 -->
      ${historyList.length > 0
        ? html`
            <details ?open=${rentedList.length === 0}>
              <summary>
                <span>대여 이력 (${historyList.length})</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div class="history-list">
                ${historyList.map((r) => this.renderHistoryRow(r))}
              </div>
            </details>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-my-rentals": PageMyRentals;
  }
}
