import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRouter } from "./router";
import { session, type SessionUser } from "./context/session";
import { reduceMotion } from "./styles/motion";
import "./components/app-header";
import "./components/app-footer";

// 관리자 청크 사전 로드 — 관리자 세션이면 브라우저가 한가할 때 관리자 화면 청크를
// 미리 받아둔다. 라우트별 코드 스플릿의 첫 클릭 빈 구간(화면 깜빡임)을 없애는 용도로,
// 일반 방문자는 관리자 청크를 받지 않는다(번들 비용 0).
function preloadAdminChunks() {
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(() => cb())
      : setTimeout(cb, 1500);
  idle(() => {
    void import("./pages/admin/item-form");
    void import("./pages/admin/reservations");
    void import("./pages/admin/members");
  });
}

// 아이콘 — 물품 등록 FAB 의 plus 하나만 쓴다.
const ICONS = {
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>`,
};

// 앱 셸 — 헤더·본문·FAB만 배치한다. 헤더는 app-header가 소유하고,
// 세션 구독은 여기서 한 번만 해 user를 헤더와 FAB 조건에 함께 쓴다.
@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null;
  private unsubscribe: (() => void) | null = null;
  private router = createRouter(this);

  static styles = [
    reduceMotion,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
      }

      main {
        flex: 1;
        width: 100%;
        max-width: var(--layout-max);
        margin: 0 auto;
        box-sizing: border-box;
        padding: var(--space-3);
        padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
        font-size: var(--text-body);
        line-height: var(--line-height);
      }
      /* 로그인은 .pen 처럼 헤더·여백 없는 전체 화면 — 셸이 방해하지 않는다 */
      main.plain {
        max-width: none;
        padding: 0;
      }
      /* 코드 스플릿 청크 로딩 구간 — 아직 등록되지 않은 페이지 요소가 빈 화면으로
         깜빡이지 않게 스피너 영역을 보여준다 (사전 로드가 커버 못 하는 콜드 로드·
         관리자 외 라우트 첫 방문용 보험) */
      main > :not(:defined) {
        display: block;
        min-height: 60vh;
      }
      main > :not(:defined)::after {
        content: "";
        display: block;
        width: 16px;
        height: 16px;
        margin: 35vh auto 0;
        border: 2px solid var(--ink-2);
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ===== 모바일 FAB ===== */
      .fab {
        display: none;
      }
      @media (max-width: 1023px) {
        /* 물품 현황은 하단 FAB 자리만 비운다 */
        main.has-fab {
          padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        }
        .fab {
          position: fixed;
          right: var(--space-2);
          bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
          z-index: 21;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border: 1px solid var(--primary-strong);
          border-radius: var(--radius-pill);
          background: var(--primary-strong);
          color: #fff;
          box-shadow: 0 8px 20px rgba(226, 87, 30, 0.28);
          transition: background 0.15s ease;
        }
        .fab:hover {
          background: var(--primary-deep);
          border-color: var(--primary-deep);
        }
        .fab:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .fab svg {
          width: 20px;
          height: 20px;
        }
      }
      @media (max-width: 767px) {
        main {
          padding: var(--space-2);
          padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.user = session.user;
    void session.ensure().then((u) => {
      if (u?.role === "admin") preloadAdminChunks();
    });
    this.unsubscribe = session.subscribe(() => {
      this.user = session.user;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private get showFab(): boolean {
    return this.user?.role === "admin" && location.pathname === "/";
  }

  private get isLogin(): boolean {
    return location.pathname === "/login";
  }

  // 시안에서 하단 푸터를 가진 화면만 — 홈·상세·정책·404.
  // 계정·대여·관리 화면은 본문에 집중하도록 푸터를 두지 않는다.
  private get footerMode(): "none" | "default" | "policy" | "surface" {
    if (this.isLogin) return "none";
    const path = location.pathname;
    if (path === "/") return "default";
    if (path.startsWith("/policy/")) return "policy";
    if (path === "/items/new" || path.endsWith("/edit")) return "none";
    if (path.startsWith("/items/")) return "default";
    const known = [
      "/mypage",
      "/signup/profile",
      "/my/rentals",
      "/admin/reservations",
      "/admin/members",
    ];
    if (known.includes(path)) return "none";
    return "surface"; // 404
  }

  render() {
    const footer = this.footerMode;
    return html`
      ${this.isLogin
        ? ""
        : html`<app-header
            .user=${this.user}
            .route=${location.pathname}
          ></app-header>`}

      <main class=${this.isLogin ? "plain" : this.showFab ? "has-fab" : ""}>
        ${this.router.outlet()}
      </main>

      ${footer === "none"
        ? ""
        : html`<app-footer
            ?surface=${footer === "surface"}
            ?narrow=${footer === "policy"}
          ></app-footer>`}

      ${this.showFab
        ? html`<a class="fab" href="/items/new" aria-label="물품 등록">${ICONS.plus}</a>`
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
