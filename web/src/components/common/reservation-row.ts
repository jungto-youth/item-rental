import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { cardCss } from "../../styles/ui";
import "../ui/badge";

// 예약 1건 행 — 내 대여 내역(my-rentals)과 관리자 대여 관리(reservations) 공용.
// 첫 줄: 제목 + 배지(선택) + 액션 슬롯. 아래: 기본 슬롯 줄들(날짜·회원·메모).
// 경고 줄은 `class="warn"` 으로 넣으면 경고 톤이 붙는다.
@customElement("reservation-row")
export class ReservationRow extends LitElement {
  @property() title = "";
  @property() badgeKind = "";
  // 대여 중 강조 — 왼쪽 액센트 바로 현재 대여 건임을 알린다
  @property({ type: Boolean, reflect: true }) active = false;

  static styles = [
    cardCss,
    css`
      :host {
        display: block;
      }
      .card {
        margin-bottom: var(--space-2, 8px);
      }
      :host([active]) .card {
        border-left: 3px solid var(--color-primary);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }
      .title {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: var(--text-body, 15px);
        letter-spacing: var(--tracking-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-shrink: 0;
      }
      .actions:empty {
        display: none;
      }
      .lines {
        display: grid;
        gap: var(--space-1, 4px);
        margin-top: var(--space-1, 4px);
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .lines:empty {
        display: none;
      }
      ::slotted(.warn) {
        color: var(--tone-warning-text);
        font-size: var(--text-fine, 12px);
      }
      ::slotted(*) {
        margin: 0;
      }
      /* 좁은 화면에서는 액션을 다음 줄로 내려 이름이 잘리지 않게 한다 */
      @media (max-width: 480px) {
        .row {
          flex-wrap: wrap;
        }
        .actions {
          width: 100%;
        }
        .actions ::slotted(*) {
          flex: 1;
        }
      }
    `,
  ];

  render() {
    return html`
      <div class="card">
        <div class="row">
          <span class="title">${this.title}</span>
          ${this.badgeKind ? html`<x-badge kind=${this.badgeKind}></x-badge>` : ""}
          <span class="actions"><slot name="actions"></slot></span>
        </div>
        <div class="lines"><slot></slot></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "reservation-row": ReservationRow;
  }
}
