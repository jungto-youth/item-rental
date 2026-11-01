import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

const LABELS: Record<string, string> = {
  available: "대여 가능",
  rented: "대여 중",
  repair: "수리중",
  retired: "폐기",
  withdrawn: "탈퇴",
  user: "회원",
  admin: "관리자",
  returned: "반납 완료",
  cancelled: "취소",
};

// 상태 배지 — 작은 알약 + 점. 상태는 문장이 말하고, 색은 보조 신호로만 쓴다.
// 색은 종류별 예외만 두고, 모양은 .badge 공통 규격이 소유한다.
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
      position: relative;
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 12px;
      border-radius: var(--radius-pill);
      background: var(--surface-muted);
      color: var(--ink-2);
      font-size: var(--text-fine);
      font-weight: 400;
      line-height: 1;
      white-space: nowrap;
    }

    .badge.available,
    .badge.admin {
      background: var(--primary-soft);
      color: var(--primary-strong);
    }

    .badge.repair {
      background: var(--warning-soft);
      color: var(--warning);
    }

    /* 점은 왼쪽 패딩 안에 두고 텍스트는 좌우 12px로 대칭을 맞춘다. */
    .dot {
      position: absolute;
      left: 4px;
      top: 50%;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ink-3);
      transform: translateY(-50%);
    }

    .dot.available,
    .dot.admin {
      background: var(--primary);
    }

    .dot.repair {
      background: var(--warning);
    }
  `;

  render() {
    const text = this.label || LABELS[this.kind] || this.kind;
    const tone =
      this.kind === "available" || this.kind === "admin" || this.kind === "repair"
        ? this.kind
        : "neutral";

    return html`
      <span class="badge ${tone}">
        <span class="dot ${tone}" aria-hidden="true"></span>
        <span>${text}</span>
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-badge": XBadge;
  }
}
