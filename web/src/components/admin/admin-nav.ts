import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

// 관리자 영역 상단 탭 — 헤더의 서브네비를 페이지 안으로 옮긴 것 (헤더 단순화).
// 라우트 가드는 그대로이고, 이 탭은 위치 안내 역할만 한다.
export type AdminTab = "dashboard" | "items" | "reservations" | "members";

const TABS: { key: AdminTab; label: string; href: string }[] = [
  { key: "dashboard", label: "대시보드", href: "/admin" },
  { key: "items", label: "물품 관리", href: "/admin/items" },
  { key: "reservations", label: "대여 관리", href: "/admin/reservations" },
  { key: "members", label: "회원 관리", href: "/admin/members" },
];

@customElement("admin-nav")
export class AdminNav extends LitElement {
  @property({ reflect: true }) active: AdminTab = "dashboard";

  static styles = css`
    :host {
      display: block;
    }
    nav {
      display: flex;
      gap: var(--space-2, 8px);
      overflow-x: auto;
      scrollbar-width: none;
      margin-bottom: var(--space-4, 16px);
    }
    nav::-webkit-scrollbar {
      display: none;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      height: 32px;
      padding: 0 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill, 8px);
      background: var(--color-surface);
      color: var(--color-muted);
      font-size: var(--text-caption, 13px);
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
      text-decoration: none;
      font-family: inherit;
      transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
    }
    .tab:hover {
      border-color: var(--color-muted);
      color: var(--color-text);
    }
    .tab.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-primary-text);
    }
  `;

  render() {
    return html`
      <nav aria-label="관리자 메뉴">
        ${TABS.map(
          (t) => html`
            <a
              class="tab ${t.key === this.active ? "active" : ""}"
              href=${t.href}
              ?aria-current=${t.key === this.active ? "page" : undefined}
            >
              ${t.label}
            </a>
          `,
        )}
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "admin-nav": AdminNav;
  }
}