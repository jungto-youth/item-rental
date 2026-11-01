import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRouter, navigate } from "./router";
import { session, type SessionUser } from "./context/session";
import { reduceMotion } from "./styles/motion";

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

type NavItem = { href: string; label: string };

// 아이콘 — 물품 등록 FAB 의 plus 하나만 쓴다.
const ICONS = {
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>`,
};

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private menuOpen = false;
  private unsubscribe: (() => void) | null = null;
  private router = createRouter(this);

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--surface);
        box-sizing: border-box;
        height: 64px;
        /* 헤어라인은 화면 폭 전체를 잇는다 — 안쪽 .bar 의 최대 폭 제한에 걸리면 끊긴다. */
        border-bottom: 1px solid var(--border);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        box-sizing: border-box;
        height: 100%;
        max-width: var(--layout-max);
        margin: 0 auto;
        padding: 0 var(--space-3);
      }
      .brand {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        text-decoration: none;
      }
      .brand img {
        display: block;
        width: 28px;
        height: 28px;
        border-radius: var(--radius);
      }
      /* 주 메뉴 — 로고 옆 텍스트 링크 */
      .nav {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .nav::-webkit-scrollbar {
        display: none;
      }
      .nav a {
        flex-shrink: 0;
        padding: var(--space-1) 0;
        border-bottom: 2px solid transparent;
        color: var(--ink-2);
        text-decoration: none;
        font-size: var(--text-body);
        font-weight: 400;
        white-space: nowrap;
      }
      .nav a:hover {
        color: var(--ink-1);
      }
      .nav a.active {
        border-bottom-color: var(--primary);
        color: var(--ink-1);
        font-weight: 600;
      }
      .account {
        position: relative;
        flex-shrink: 0;
        margin-left: auto;
      }
      .account-btn {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1) 0;
        border: none;
        background: none;
        font-family: inherit;
        font-size: var(--text-body);
        line-height: var(--line-height-button);
        cursor: pointer;
        border-radius: var(--radius-pill);
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-fine);
        font-weight: 600;
      }
      .account-name {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--ink-2);
        font-size: var(--text-body);
      }
      .account-chevron {
        flex: none;
        width: 16px;
        height: 16px;
        color: var(--ink-2);
      }
      .account-btn:focus-visible {
        outline: 2px solid var(--ink-1);
        outline-offset: 2px;
      }
      .menu {
        position: absolute;
        top: calc(100% + var(--space-1));
        right: 0;
        min-width: 176px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-shadow: var(--shadow-menu);
        overflow: hidden;
        z-index: 20;
      }
      .menu a,
      .menu button {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: var(--space-2);
        text-align: left;
        background: none;
        border: none;
        color: var(--ink-1);
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-body);
        line-height: var(--line-height-button);
        cursor: pointer;
      }
      .menu a:hover,
      .menu button:hover {
        background: var(--surface-muted);
      }
      .menu .menu-logout {
        color: var(--danger);
      }
      .btn-login {
        display: flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--primary);
        border-radius: var(--radius);
        background: var(--primary);
        color: #fff;
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-body);
        font-weight: 600;
        line-height: var(--line-height-button);
        letter-spacing: var(--tracking-tight);
        cursor: pointer;
      }

      main {
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
      @media (max-width: 767px) {
        header {
          height: 56px;
        }
        .bar {
          gap: var(--space-2);
          padding: 0 var(--space-2);
        }
        /* 좁은 화면에서는 메뉴 자리를 위해 계정 이름을 숨긴다 (이니셜만) */
        .account-name {
          display: none;
        }
        main {
          padding: var(--space-2);
          padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
        }
        /* 물품 현황은 하단 FAB 자리만 비운다 */
        main.has-fab {
          padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        }
        .fab {
          position: fixed;
          right: var(--space-3);
          bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
          z-index: 21;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border: 1px solid var(--primary);
          border-radius: var(--radius-pill);
          background: var(--primary);
          color: #fff;
          box-shadow: 0 8px 20px rgba(226, 87, 30, 0.28);
        }
        .fab svg {
          width: 20px;
          height: 20px;
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
    window.addEventListener("pointerdown", this.onGlobalPointerDown);
    window.addEventListener("keydown", this.onGlobalKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener("pointerdown", this.onGlobalPointerDown);
    window.removeEventListener("keydown", this.onGlobalKeydown);
    this.menuOpen = false;
  }

  // ===== 내비게이션 =====
  // 모바일·데스크톱 모두 같은 상단 메뉴를 쓴다.
  // 관리자: 물품 현황 · 대여 기록(관리) · 회원 관리 / 회원: 물품 현황 · 대여 기록(내역)
  private get navItems(): NavItem[] {
    if (!this.user) return [];
    const isAdmin = this.user.role === "admin";
    return [
      { href: "/", label: "물품 현황" },
      {
        href: isAdmin ? "/admin/reservations" : "/my/rentals",
        label: "대여 기록",
      },
      ...(isAdmin
        ? [{ href: "/admin/members", label: "회원 관리" }]
        : []),
    ];
  }

  private isActive(href: string): boolean {
    const path = location.pathname;
    if (href === "/") return path === "/";
    return path === href || path.startsWith(`${href}/`);
  }

  private get showFab(): boolean {
    return this.user?.role === "admin" && location.pathname === "/";
  }

  private get isLogin(): boolean {
    return location.pathname === "/login";
  }

  // 계정 메뉴 — 외부 클릭이나 Esc로 닫는다
  private onGlobalPointerDown = (e: PointerEvent) => {
    if (!this.menuOpen) return;
    if (!e.composedPath().includes(this)) this.menuOpen = false;
  };

  private onGlobalKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.menuOpen = false;
  };

  private async signOut() {
    this.menuOpen = false;
    // JWT 세션은 서버에 상태가 없다 — signout은 응답으로 쿠키를 지울 뿐이다.
    // 네트워크가 나빠도 버튼이 멈추지 않게 타임아웃을 두고, 실패해도 로컬 세션은 비운다
    // (쿠키가 남으면 다음 요청에서 다시 로그인 상태로 보일 수 있으나, 재시도 이전 상태보다 낫다).
    try {
      const csrfRes = await fetch("/api/auth/csrf", { signal: AbortSignal.timeout(10_000) });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // 네트워크 오류 — 서버 쿠키 삭제는 못 했지만 로그아웃 의사는 그대로 반영한다
    }
    session.clear();
    await session.refresh();
    navigate("/");
  }

  private get accountLabel(): string {
    return this.user?.name || this.user?.email || "";
  }
  private get accountInitial(): string {
    return this.accountLabel.trim().charAt(0).toUpperCase();
  }

  render() {
    const user = this.user;
    return html`
      ${this.isLogin
        ? ""
        : html`<header>
        <div class="bar">
          <a href="/" class="brand" aria-label="물품 현황 — 홈">
            <img src="/logo.png" alt="" />
          </a>

          ${user
            ? html`
                <nav class="nav" aria-label="주 메뉴">
                  ${this.navItems.map(
                    (item) => html`
                      <a
                        href=${item.href}
                        class=${this.isActive(item.href) ? "active" : ""}
                        ?aria-current=${this.isActive(item.href) ? "page" : null}
                      >
                        ${item.label}
                      </a>
                    `,
                  )}
                </nav>
                <div class="account">
                  <button
                    class="account-btn"
                    aria-haspopup="menu"
                    aria-expanded=${this.menuOpen}
                    aria-label="계정 메뉴 — ${this.accountLabel}"
                    title="계정 메뉴"
                    @click=${() => (this.menuOpen = !this.menuOpen)}
                  >
                    <span class="avatar" aria-hidden="true">${this.accountInitial}</span>
                    <span class="account-name">${this.accountLabel}</span>
                    <svg class="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  ${this.menuOpen
                    ? html`
                        <div class="menu" role="menu">
                          <a
                            role="menuitem"
                            href="/mypage"
                            @click=${() => (this.menuOpen = false)}
                          >
                            내 정보
                          </a>
                          <button role="menuitem" class="menu-logout" @click=${this.signOut}>
                            로그아웃
                          </button>
                        </div>
                      `
                    : ""}
                </div>
              `
            : location.pathname !== "/login"
              ? html`<a class="btn-login" href="/login">로그인</a>`
              : null}
        </div>
      </header>`}

      <main class=${this.isLogin ? "plain" : this.showFab ? "has-fab" : ""}>${this.router.outlet()}</main>

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
