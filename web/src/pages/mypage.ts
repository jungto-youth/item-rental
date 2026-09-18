import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import "../components/ui/badge";
import type { MyReservation } from "../types";
import { reduceMotion } from "../styles/motion";

// SPEC §4.1 — 마이페이지: 프로필 + 내 대여 현황·이력·취소
@customElement("page-mypage")
export class PageMypage extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private loading = true;
  @state() private reservations: MyReservation[] = [];
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
      h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: var(--space-6) 0 var(--space-2);
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-4);
        display: grid;
        gap: var(--space-2);
        font-size: var(--text-body);
        line-height: 1.47;
      }
      .pending {
        border-color: var(--color-warning);
        background: var(--tone-warning-bg);
        color: var(--tone-warning-text);
      }
      .row {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-3) var(--space-4);
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--text-body);
        margin-bottom: var(--space-2);
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
      .link {
        background: none;
        border: 0;
        color: var(
          --color-primary
        ); /* DESIGN.md §5 — 텍스트 동작은 블루 링크 */
        cursor: pointer;
        padding: 0 var(--space-2);
        font-size: var(--text-caption);
        font-family: inherit;
        line-height: 44px;
      }
      .link:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      /* 취소만 danger — 되돌릴 수 없는 파괴적 동작이라 반납(블루)과 구분한다 (DESIGN.md §4) */
      .link.danger {
        color: var(--color-danger);
      }
      .note {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .empty {
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .msg {
        color: var(--color-primary);
        font-size: var(--text-caption);
        min-height: 1.2em;
      }
      p {
        color: var(--color-muted);
        line-height: 1.47;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.loading = false;
    if (this.user?.status === "approved") await this.loadReservations();
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

  // created_at(ISO 8601) → YYYY-MM-DD. 날짜 개념이 없어져 신청일 표시만 남았다
  private fmtDate(iso: string): string {
    return iso.slice(0, 10);
  }

  private async cancel(r: MyReservation) {
    if (!confirm("대여를 취소할까요?")) return;
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/reservations/${r.id}/cancel`, { method: "POST" });
      this.message = "취소했어요";
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "취소 실패";
    } finally {
      this.busy = false;
    }
  }

  // 반납 — 물품을 돌려준 회원이 직접 처리한다. 관리자에게 요청할 필요가 없다
  private async returnItem(r: MyReservation) {
    if (!confirm(`${r.item_name}을(를) 돌려주셨나요? 반납 처리할까요?`)) return;
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/reservations/${r.id}/return`, { method: "POST" });
      this.message = "반납 처리했어요";
      await this.loadReservations();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "반납 실패";
    } finally {
      this.busy = false;
    }
  }

  private renderGroup(title: string, rows: MyReservation[]) {
    if (rows.length === 0) return "";
    return html`
      <h2>${title}</h2>
      ${rows.map((r) => this.renderRow(r))}
    `;
  }

  private renderRow(r: MyReservation) {
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
        ${
          r.status === "rented"
            ? html`<button
                  class="link"
                  ?disabled=${this.busy}
                  @click=${() => this.returnItem(r)}
                >
                  반납
                </button>
                <button
                  class="link danger"
                  ?disabled=${this.busy}
                  @click=${() => this.cancel(r)}
                >
                  취소
                </button>`
            : ""
        }
      </div>
      ${
        r.member_memo
          ? html`<p class="note">메모: ${r.member_memo}</p>`
          : ""
      }
    `;
  }

  render() {
    if (this.loading) return html`<p>불러오는 중…</p>`;
    if (!this.user) return html`<p>로그인이 필요해요</p>`;

    return html`
      <h1>마이페이지</h1>
      <div class="card">
        <span><b>${this.user.name || this.user.email}</b></span>
        <span>${this.user.email}</span>
        ${this.user.phone ? html`<span>연락처: ${this.user.phone}</span>` : ""}
        <span>상태: <x-badge kind=${this.user.status}></x-badge></span>
        ${this.user.phone ? html`<span><a class="link" href="/signup/profile">프로필 수정</a></span>` : ""}
      </div>
      ${
        this.user.status === "inactive"
          ? html`
              <div class="card" style="margin-top: var(--space-3)">
                비활성화된 계정이에요 — 재대여를 원하시면 관리자에게
                문의해주세요.
              </div>
            `
          : this.user.status === "pending"
            ? html`
                <div class="card pending" style="margin-top: var(--space-3)">
                  승인 대기 중이에요 — 관리자 승인 후 물품을 대여할 수 있어요.
                </div>
              `
            : html`
                <p class="msg" aria-live="polite">${this.message}</p>
                ${this.renderGroup(
                  "대여 중",
                  this.reservations.filter((r) => r.status === "rented"),
                )}
                ${this.renderGroup(
                  "대여 이력",
                  this.reservations.filter(
                    (r) => r.status === "returned" || r.status === "cancelled",
                  ),
                )}
                ${
                  this.reservations.length === 0
                    ? html`<h2>내 대여</h2>
                        <p class="empty">
                          아직 대여 내역이 없어요 — 물품 상세에서 대여할 수
                          있어요
                        </p>`
                    : ""
                }
              `
      }
      ${
        this.user.phone
          ? ""
          : html`
              <div class="card" style="margin-top: var(--space-3)">
                물품을 대여하려면 연락처를 등록해야 해요 —
                <a href="/signup/profile">프로필 입력하기</a>
              </div>
            `
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-mypage": PageMypage;
  }
}
