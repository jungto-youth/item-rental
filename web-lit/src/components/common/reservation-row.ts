import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { cardCss } from "../../styles/ui";
import "../ui/badge";

// 예약 1건 행 — 내 대여 내역(my-rentals)과 관리자 대여 관리(reservations) 공용.
// 첫 줄: 제목 + 배지(선택) + 액션 슬롯. 아래: 기본 슬롯 줄들(날짜·회원·메모).
// 경고 줄은 `class="warn"` 으로 넣으면 경고 톤이 붙는다.
@customElement("reservation-row")
export class ReservationRow extends LitElement {
  @property() title = "";
  @property() badgeKind = "";
  // 대여 중 강조 — 테두리를 잉크색으로 올려 현재 대여 건임을 알린다
  @property({ type: Boolean, reflect: true }) active = false;
  // 관리자 목록처럼 액션이 하나뿐인 행은 모바일에서도 제목 옆에 인라인으로 둔다
  @property({ type: Boolean, reflect: true }) inlineActions = false;

  // 슬롯이 비었으면 빈 상자를 그리지 않는다. (:empty 는 <slot> 자식 때문에 절대 매치되지 않는다)
  @state() private hasActions = false;
  @state() private hasLines = false;

  private onSlotChange(which: "actions" | "lines", e: Event) {
    const nodes = (e.target as HTMLSlotElement).assignedNodes({ flatten: true });
    const filled = nodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
    );
    if (which === "actions") this.hasActions = filled;
    else this.hasLines = filled;
  }

  static styles = [
    cardCss,
    css`
      :host {
        display: block;
      }
      :host([active]) .card {
        border-color: var(--ink-1);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .title {
        flex: 0 1 auto;
        min-width: 0;
        font-weight: 600;
        font-size: var(--text-body);
        letter-spacing: var(--tracking-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
        margin-left: auto;
      }
      .actions.empty {
        display: none;
      }
      .lines {
        display: grid;
        gap: 4px;
        margin-top: var(--space-1);
        font-size: var(--text-fine);
        color: var(--ink-2);
      }
      .lines.empty {
        display: none;
      }
      ::slotted(.warn) {
        color: var(--danger);
        font-size: var(--text-fine);
      }
      ::slotted(*) {
        margin: 0;
      }
      /* 좁은 화면에서는 액션을 다음 줄로 내려 이름이 잘리지 않게 한다 */
      @media (max-width: 639px) {
        .row {
          flex-wrap: wrap;
        }
        .actions {
          width: 100%;
        }
        .actions ::slotted(*) {
          flex: 1;
        }
        /* 액션이 하나뿐인 관리자 행 — 시안처럼 제목·배지·버튼을 한 줄에 둔다 */
        :host([inline-actions]) .row {
          flex-wrap: nowrap;
        }
        :host([inline-actions]) .actions {
          width: auto;
          flex-shrink: 0;
        }
        :host([inline-actions]) .actions ::slotted(*) {
          flex: none;
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
          <span class="actions ${this.hasActions ? "" : "empty"}">
            <slot name="actions" @slotchange=${(e: Event) => this.onSlotChange("actions", e)}></slot>
          </span>
        </div>
        <div class="lines ${this.hasLines ? "" : "empty"}">
          <slot @slotchange=${(e: Event) => this.onSlotChange("lines", e)}></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "reservation-row": ReservationRow;
  }
}
