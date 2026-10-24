import { LitElement, html, css, type TemplateResult } from "lit";
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

type NavItem = { href: string; label: string; icon: TemplateResult };

// 아이콘 — .pen 의 lucide 세트(package·history·users·user-round·plus)를 인라인 SVG 로.
const ICONS = {
  package: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>`,
  history: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>`,
  users: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>`,
  user: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>`,
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
        background: var(--color-bg);
        border-bottom: 1px solid var(--color-border);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--space-5, 24px);
        box-sizing: border-box;
        height: 48px;
        max-width: 1440px;
        margin: 0 auto;
        padding: 0 var(--space-5, 24px);
      }
      .brand {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        text-decoration: none;
      }
      .brand img {
        display: block;
        width: 24px;
        height: 24px;
        border-radius: var(--radius-sm, 6px);
      }
      /* 주 메뉴 — .pen Top Bar: 로고 옆 텍스트 링크 */
      .nav {
        display: flex;
        align-items: center;
        gap: var(--space-5, 24px);
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .nav::-webkit-scrollbar {
        display: none;
      }
      .nav a {
        flex-shrink: 0;
        color: var(--color-ink-3, #9c9c9c);
        text-decoration: none;
        font-size: 1rem;
        font-weight: 400;
        white-space: nowrap;
        transition: color 0.15s ease;
      }
      .nav a:hover {
        color: var(--color-text);
      }
      .nav a.active {
        color: var(--color-text);
        font-weight: 700;
      }
      .account {
        position: relative;
        flex-shrink: 0;
        margin-left: auto;
      }
      .account-btn {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: 0;
        border: none;
        background: none;
        font-family: inherit;
        cursor: pointer;
        border-radius: var(--radius-pill, 999px);
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--color-primary-soft, #ffedd5);
        color: var(--color-primary);
        font-size: var(--text-fine, 12px);
        font-weight: 700;
      }
      .account-name {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-ink-3, #9c9c9c);
        font-size: 1rem;
      }
      .account-btn:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 2px;
      }
      .menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: 160px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        z-index: 20;
      }
      .menu a,
      .menu button {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 12px 16px;
        text-align: left;
        background: none;
        border: none;
        color: var(--color-text);
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-caption, 13px);
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .menu a:hover,
      .menu button:hover {
        background: var(--color-bg);
      }
      .menu .menu-logout {
        color: var(--color-danger);
      }
      .btn-login {
        display: flex;
        align-items: center;
        height: 36px;
        padding: 0 var(--space-3);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-sm, 6px);
        background: transparent;
        color: var(--tone-primary-text);
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-caption);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        cursor: pointer;
      }

      main {
        max-width: 1440px;
        margin: 0 auto;
        padding: var(--space-5, 24px);
        padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
        font-size: var(--text-body);
        line-height: 1.47;
      }
      /* 로그인은 .pen 처럼 헤더·여백 없는 전체 화면 — 셸이 방해하지 않는다 */
      main.plain {
        max-width: none;
        padding: 0;
      }
      /* 목록 화면은 .pen 처럼 헤더 바로 아래 12px에서 시작한다 (Page Header padding-top) */
      main.flush {
        padding-top: 0;
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
        border: 2px solid var(--color-muted);
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ===== 모바일 하단 탭 바 + FAB (.pen Bottom) ===== */
      .tabbar {
        display: none;
      }
      .fab {
        display: none;
      }
      @media (max-width: 767px) {
        .bar {
          padding: 0 var(--space-4, 16px);
          gap: var(--space-3, 12px);
        }
        .nav {
          display: none;
        }
        main {
          padding: var(--space-4, 16px) var(--space-5, 24px);
          padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
        }
        .tabbar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 20;
          display: flex;
          justify-content: center;
          background: var(--color-bg);
          border-top: 1px solid var(--color-border);
          padding: var(--space-2, 8px) var(--space-4, 16px)
            calc(var(--space-2, 8px) + env(safe-area-inset-bottom, 0px));
        }
        .tabbar a {
          display: flex;
          flex: 1;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1, 4px);
          padding: var(--space-1, 4px);
          color: var(--color-muted);
          text-decoration: none;
          font-size: var(--text-fine, 12px);
          white-space: nowrap;
        }
        .tabbar a svg {
          width: 20px;
          height: 20px;
        }
        .tabbar a.active {
          color: var(--color-primary);
          font-weight: 700;
        }
        .fab {
          position: fixed;
          right: var(--space-5, 24px);
          bottom: calc(84px + env(safe-area-inset-bottom, 0px));
          z-index: 21;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--radius-pill, 999px);
          background: var(--color-primary);
          color: var(--color-primary-text);
          box-shadow: 0 6px 16px rgba(234, 88, 12, 0.35);
        }
        .fab svg {
          width: 24px;
          height: 24px;
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
  // 데스크탑 Top Bar 와 모바일 Bottom Tab Bar 가 같은 목록을 공유한다.
  // 관리자: 물품 현황 · 대여 기록(관리) · 회원 관리 / 회원: 물품 현황 · 대여 기록(내역)
  private get navItems(): NavItem[] {
    if (!this.user) return [];
    const isAdmin = this.user.role === "admin";
    return [
      { href: "/", label: "물품 현황", icon: ICONS.package },
      {
        href: isAdmin ? "/admin/reservations" : "/my/rentals",
        label: "대여 기록",
        icon: ICONS.history,
      },
      ...(isAdmin
        ? [{ href: "/admin/members", label: "회원 관리", icon: ICONS.users }]
        : []),
    ];
  }

  // 하단 탭은 내 정보까지 포함한다
  private get tabItems(): NavItem[] {
    if (!this.user) return [];
    return [...this.navItems, { href: "/mypage", label: "내 정보", icon: ICONS.user }];
  }

  private isActive(href: string): boolean {
    const path = location.pathname;
    if (href === "/") return path === "/";
    if (href === "/mypage") return path === "/mypage";
    return path === href || path.startsWith(`${href}/`);
  }

  private get showFab(): boolean {
    return this.user?.role === "admin" && location.pathname === "/";
  }

  private get isLogin(): boolean {
    return location.pathname === "/login";
  }

  private get isHome(): boolean {
    return location.pathname === "/";
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

      <main class=${this.isLogin ? "plain" : this.isHome ? "flush" : ""}>${this.router.outlet()}</main>

      ${this.showFab
        ? html`<a class="fab" href="/items/new" aria-label="물품 등록">${ICONS.plus}</a>`
        : ""}

      ${user
        ? html`
            <nav class="tabbar" aria-label="하단 메뉴">
              ${this.tabItems.map(
                (item) => html`
                  <a
                    href=${item.href}
                    class=${this.isActive(item.href) ? "active" : ""}
                    ?aria-current=${this.isActive(item.href) ? "page" : null}
                  >
                    ${item.icon}
                    <span>${item.label}</span>
                  </a>
                `,
              )}
            </nav>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
