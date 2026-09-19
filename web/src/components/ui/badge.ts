import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

const LABELS: Record<string, string> = {
  available: "대여 가능",
  rented: "대여 중",
  repair: "수리중",
  retired: "폐기",
  active: "활성",
  inactive: "비활성",
  user: "회원",
  admin: "관리자",
  returned: "반납 완료",
  cancelled: "취소",
};

// DESIGN.md §2 — 미니멀 상태 배지: 무채색 칩 + 상태 점(Status Dot)
@customElement("x-badge")
export class XBadge extends LitElement {
  @property() kind = "neutral";
  @property() label = "";

  static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: var(--radius-sm, 6px);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-fine, 12px);
      font-weight: 500;
      line-height: 1.4;
      white-space: nowrap;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-muted);
      flex-shrink: 0;
    }

    /* 상태별 점 색상 */
    .available .dot,
    .returned .dot {
      background: var(--dot-available, #10b981);
    }
    .rented .dot {
      background: var(--dot-rented, #71717a);
      border: 1px solid currentColor;
      box-sizing: border-box;
    }
    .repair .dot {
      background: var(--dot-repair, #f59e0b);
    }
    .admin .dot {
      background: var(--color-primary);
    }
    .retired .dot,
    .inactive .dot,
    .cancelled .dot,
    .neutral .dot {
      background: var(--color-muted);
    }
  `;

  render() {
    const text = this.label || LABELS[this.kind] || this.kind;
    return html`
      <span class="badge ${this.kind}">
        <span class="dot"></span>
        <span class="text">${text}</span>
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-badge": XBadge;
  }
}
