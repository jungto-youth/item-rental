import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { fmtKstDate } from "../utils/date";
import { confirmDialog } from "../utils/confirm";
import { session } from "../context/session";
import "../components/ui/badge";
import "../components/ui/empty";
import "../components/ui/page-header";
import type { MyReservation } from "../types";
import { reduceMotion } from "../styles/motion";
import { sectionHeadingCss, linkButtonCss } from "../styles/sections";

// 대여 내역 페이지: 현재 대여 중 + 대여 이력 + 반납·취소
@customElement("page-my-rentals")
export class PageMyRentals extends LitElement {
  @state() private loading = true;
  @state() private reservations: MyReservation[] = [];
  @state() private busy = false;
  @state() private message = "";

  static styles = [
    reduceMotion,
    sectionHeadingCss,
    linkButtonCss,
    css`
      :host {
        display: block;
      }
      .section-top {
        margin-top: var(--space-2);
      }
      .row {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        padding: var(--space-3) var(--space-4);
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--text-body);
        margin-bottom: var(--space-2);
        transition: border-color 0.15s ease;
      }
      .row.active-row {
        border-left: 3px solid var(--color-primary);
      }
      .row .name {
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .row .dates {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .row .spacer {
        flex: 1;
      }
      .action-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .note {
        color: var(--color-muted);
        font-size: var(--text-caption);
        margin: -4px 0 var(--space-2) var(--space-2);
      }
      .empty-box {
        text-align: center;
        padding: var(--space-5) var(--space-4);
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-md, 8px);
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
      this.message = e instanceof Error ? e.message : "오류";
    }
  }

  private fmtDate(iso: string): string {
    return fmtKstDate(iso);
  }

  private async doCancel(r: MyReservation) {
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/reservations/${r.id}/cancel`, { method: "POST" });
      this.message = `${r.item_name} 대여를 취소했어요`;
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "취소 실패";
    } finally {
      this.busy = false;
    }
  }

  private async doReturn(r: MyReservation) {
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/reservations/${r.id}/return`, { method: "POST" });
      this.message = `${r.item_name} 반납 완료 처리되었어요`;
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "반납 실패";
    } finally {
      this.busy = false;
    }
  }

  // 확인은 다른 화면과 같은 confirmDialog(모달)로 — 반납·취소는 되돌릴 수 있거나
  // 자기 신고라 위험 동작이 아니므로 확인 버튼은 기본(primary) 톤을 쓴다
  private async onReturn(r: MyReservation) {
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
    return html`
      <div class="row active-row">
        <div>
          <div class="name">
            ${r.item_name}${r.qty > 1 ? ` · ${r.qty}개` : ""}
          </div>
          <div class="dates">${this.fmtDate(r.created_at)} 대여 신청</div>
        </div>
        <div class="spacer"></div>
        <div class="action-group">
          <button class="link-btn" ?disabled=${this.busy} @click=${() => this.onReturn(r)}>
            반납하기
          </button>
          <button class="link-btn danger" ?disabled=${this.busy} @click=${() => this.onCancel(r)}>
            취소
          </button>
        </div>
      </div>
      ${r.member_memo ? html`<p class="note">메모: ${r.member_memo}</p>` : ""}
    `;
  }

  private renderHistoryRow(r: MyReservation) {
    return html`
      <div class="row">
        <div>
          <div class="name">
            ${r.item_name}${r.qty > 1 ? ` · ${r.qty}개` : ""}
          </div>
          <div class="dates">${this.fmtDate(r.created_at)} 대여</div>
        </div>
        <div class="spacer"></div>
        <x-badge kind=${r.status}></x-badge>
      </div>
      ${r.member_memo ? html`<p class="note">메모: ${r.member_memo}</p>` : ""}
    `;
  }

  render() {
    if (this.loading) return html`<x-empty state="loading"></x-empty>`;
    if (!session.user) return html`<x-empty state="empty" text="로그인이 필요해요"></x-empty>`;

    const rentedList = this.reservations.filter((r) => r.status === "rented");
    const historyList = this.reservations.filter(
      (r) => r.status === "returned" || r.status === "cancelled",
    );

    return html`
      <x-page-header title="대여 내역"></x-page-header>

      ${this.message ? html`<p class="msg" aria-live="polite">${this.message}</p>` : ""}

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