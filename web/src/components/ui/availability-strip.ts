import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AvailabilityDay } from "../../types";
import { fmtShort } from "../../utils/date";

// SPEC §7.6 — 향후 90일 가용 스트립: 완전 점유일은 굵게, 일부 점유는 옅게
@customElement("availability-strip")
export class AvailabilityStrip extends LitElement {
  @property({ type: Array }) days: AvailabilityDay[] = [];
  @property({ type: Number }) totalQty = 1;

  static styles = css`
    .bar {
      display: flex;
      gap: 1px;
      height: 14px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--color-border);
    }
    .bar i {
      flex: 1;
      background: var(--color-success);
      opacity: 0.45;
    }
    .bar i.partial {
      background: var(--color-warning);
      opacity: 0.55;
    }
    .bar i.busy {
      background: var(--color-danger);
      opacity: 0.9;
    }
    .legend {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-2);
      font-size: var(--text-fine);
      color: var(--color-muted);
    }
    .legend i {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 2px;
      margin-right: 4px;
    }
    ul {
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-caption);
    }
    li {
      color: var(--color-text);
    }
  `;

  // 연속된 완전 점유일을 기간 목록으로 묶기
  private busyRanges(): { start: string; end: string }[] {
    const out: { start: string; end: string }[] = [];
    let start: string | null = null;
    let end = "";
    for (const d of this.days) {
      if (d.reserved >= this.totalQty) {
        if (!start) start = d.date;
        end = d.date;
      } else if (start) {
        out.push({ start, end });
        start = null;
      }
    }
    if (start) out.push({ start, end });
    return out;
  }

  render() {
    if (this.days.length === 0) return html`<div></div>`;

    return html`
      <div class="bar" aria-hidden="true">
        ${this.days.map(
          (d) =>
            html`<i
              class=${d.reserved >= this.totalQty ? "busy" : d.reserved > 0 ? "partial" : ""}
            ></i>`,
        )}
      </div>
      <div class="legend">
        <span><i style="background:var(--color-success)"></i>여유</span>
        <span><i style="background:var(--color-warning)"></i>일부 예약</span>
        <span><i style="background:var(--color-danger)"></i>전량 예약</span>
      </div>
      ${
        this.busyRanges().length > 0
          ? html`
              <ul>
                ${this.busyRanges().map(
                  (r) =>
                    html`<li>
                      ·
                      ${fmtShort(r.start)}${r.start !== r.end ? ` ~ ${fmtShort(r.end)}` : ""}
                      전량 예약
                    </li>`,
                )}
              </ul>
            `
          : ""
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "availability-strip": AvailabilityStrip;
  }
}
