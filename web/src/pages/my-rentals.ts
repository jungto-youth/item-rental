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
import { sectionTitleCss } from "../styles/ui";

// 대여 내역 페이지: 현재 대여 중 + 대여 이력 + 반납·취소
@customElement("page-my-rentals")
export class PageMyRentals extends LitElement {
  @state() private loading = true;
  @state() private reservations: MyReservation[] = [];
  @state() private busy = false;
  @state() private message = "";
  // 성공/실패 구분 — "취소 실패"가 "취소했어요"와 같은 파란색으로 나오면 안 된다
  @state() private messageTone: "info" | "success" | "error" = "info";
  // 반납·취소 처리 중인 예약 — 어느 행이, 어느 동작이 걸려 있는지 알아야
  // 그 행의 그 버튼에만 스피너를 띄울 수 있다
  @state() private processing: { id: number; kind: "return" | "cancel" } | null =
    null;

  static styles = [
    reduceMotion,
    sectionTitleCss,
    css`
      :host {
        display: block;
      }
      .section-top {
        margin-top: var(--space-2);
      }
      .empty-box {
        text-align: center;
        padding: var(--space-5) var(--space-4);
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-lg, 12px);
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .empty-box a {
        display: inline-block;
        margin-top: var(--space-2);
        color: var(--color-primary);
        font-weight: 500;
        text-decoration: none;
      }
      .msg {
        color: var(--color-primary);
        font-size: var(--text-caption);
        min-height: 1.2em;
        margin: 0 0 var(--space-2);
      }
      .msg.success {
        color: var(--tone-success-text, var(--color-primary));
      }
      .msg.error {
        color: var(--tone-danger-text, var(--color-danger));
      }
      details.history-details {
        margin-top: var(--space-5);
      }
      details.history-details summary {
        cursor: pointer;
        font-size: var(--text-heading, 1.0625rem);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        color: var(--color-text);
        padding: var(--space-2) 0;
        user-select: none;
      }
      .history-list {
        margin-top: var(--space-3);
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

  private fmtDate(iso: string): string {
    return fmtKstDate(iso);
  }

  private async doCancel(r: MyReservation) {
    if (this.busy) return;
    this.busy = true;
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
      this.busy = false;
      this.processing = null;
    }
  }

  private async doReturn(r: MyReservation) {
    if (this.busy) return;
    this.busy = true;
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
      this.busy = false;
      this.processing = null;
    }
  }

  // 확인은 다른 화면과 같은 confirmDialog(모달)로 — 반납·취소는 되돌릴 수 있거나
  // 자기 신고라 위험 동작이 아니므로 확인 버튼은 기본(primary) 톤을 쓴다
  private async onReturn(r: MyReservation) {
    // busy 확인은 다이얼로그보다 먼저 — 뒤에 두면 연타로 다이얼로그가 두 개 열린다
    if (this.busy) return;
    if (
      !(await confirmDialog(`'${r.item_name}'를 반납할까요?`, {
        confirmLabel: "반납",
        danger: false,
      }))
    )
      return;
    await this.doReturn(r);
  }

  private async onCancel(r: MyReservation) {
    if (this.busy) return;
    if (
      !(await confirmDialog(`'${r.item_name}' 대여를 취소할까요?`, {
        confirmLabel: "취소",
        danger: false,
      }))
    )
      return;
    await this.doCancel(r);
  }

  private renderActiveRow(r: MyReservation) {
    // 처리 중인 건만 스피너 — 목록 전체가 함께 잠기면 어느 건이 걸렸는지 모른다
    const mine = this.processing?.id === r.id;
    const blocked = this.busy && !mine;
    return html`
      <reservation-row active title="${r.item_name} · ${r.qty}개">
        <x-button
          slot="actions"
          variant="primary"
          size="md"
          ?loading=${mine && this.processing?.kind === "return"}
          ?disabled=${blocked}
          @click=${() => this.onReturn(r)}
        >
          반납하기
        </x-button>
        <x-button
          slot="actions"
          variant="secondary"
          size="md"
          ?loading=${mine && this.processing?.kind === "cancel"}
          ?disabled=${blocked}
          @click=${() => this.onCancel(r)}
        >
          취소
        </x-button>
        <span>${this.fmtDate(r.created_at)} 대여 신청</span>
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
          ${this.fmtDate(r.created_at)} 대여${r.status === "returned" ? html` → ${this.fmtDate(r.updated_at)} 반납` : ""}
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
          <x-button variant="primary" size="md" @click=${() => navigate("/login")}>
            로그인
          </x-button>
        </x-empty>
      `;

    const rentedList = this.reservations.filter((r) => r.status === "rented");
    const historyList = this.reservations.filter(
      (r) => r.status === "returned" || r.status === "cancelled",
    );

    return html`
      <x-page-header title="대여 내역"></x-page-header>

      ${this.message
        ? html`<p
            class="msg ${this.messageTone}"
            role=${this.messageTone === "error" ? "alert" : "status"}
          >
            ${this.message}
          </p>`
        : ""}

      <!-- 1순위: 현재 대여 중인 물품 -->
      <section class="section-top">
        <h2>현재 대여 중 (${rentedList.length})</h2>
        ${rentedList.length > 0
          ? html`${rentedList.map((r) => this.renderActiveRow(r))}`
          : html`
              <div class="empty-box">
                현재 대여 중인 물품이 없어요
                <br />
                <a href="/">물품 둘러보고 대여하기 →</a>
              </div>
            `}
      </section>

      <!-- 2순위: 과거 대여 이력 -->
      ${historyList.length > 0
        ? html`
            <details class="history-details" ?open=${rentedList.length === 0}>
              <summary>대여 이력 (${historyList.length})</summary>
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