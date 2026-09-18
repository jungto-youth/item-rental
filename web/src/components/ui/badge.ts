import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

const LABELS: Record<string, string> = {
  available: "대여 가능",
  rented: "대여 중",
  repair: "수리중",
  retired: "폐기",
  inactive: "비활성",
  user: "회원",
  admin: "관리자",
  returned: "반납 완료",
  cancelled: "취소",
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
    .user,
    .returned {
      background: var(--tone-success-bg);
      color: var(--tone-success-text);
    }
    /* 대여 중은 물품이 나가 있는 상태 — 회수해야 할 대상이라 경고 톤 */
    .rented {
      background: var(--tone-warning-bg);
      color: var(--tone-warning-text);
    }
    .repair {
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
