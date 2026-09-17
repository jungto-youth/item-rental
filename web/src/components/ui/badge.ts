import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

const LABELS: Record<string, string> = {
  available: "대여 가능",
  reserved: "예약 있음",
  rented: "대여 중",
  repair: "수리중",
  retired: "폐기",
  pending: "승인 대기",
  approved: "승인",
  inactive: "비활성",
  user: "회원",
  admin: "관리자",
  picked_up: "대여 중",
  returned: "반납 완료",
  rejected: "거절",
  cancelled: "취소",
  overdue: "연체",
};

@customElement("x-badge")
export class XBadge extends LitElement {
  @property() kind = "neutral";

  static styles = css`
    span {
      display: inline-block;
      padding: 2px 10px;
      border-radius: var(--radius-pill);
      font-size: var(--text-fine); /* 12px */
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    /* 상태 색은 tokens.css의 톤 토큰 — 다크/라이트 자동 대응 */
    .available,
    .approved,
    .user,
    .returned {
      background: var(--tone-success-bg);
      color: var(--tone-success-text);
    }
    .reserved,
    .pending {
      background: var(--tone-warning-bg);
      color: var(--tone-warning-text);
    }
    .rented,
    .rejected,
    .overdue {
      background: var(--tone-danger-bg);
      color: var(--tone-danger-text);
    }
    .repair,
    .picked_up {
      background: var(--tone-info-bg);
      color: var(--tone-info-text);
    }
    .admin {
      background: var(--tone-violet-bg);
      color: var(--tone-violet-text);
    }
    .retired,
    .neutral,
    .cancelled,
    .inactive {
      background: var(--color-border);
      color: var(--color-muted);
    }
  `;

  render() {
    return html`<span class=${this.kind}
      >${LABELS[this.kind] ?? this.kind}</span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-badge": XBadge;
  }
}
