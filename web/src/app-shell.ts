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
      .row-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        box-sizing: border-box;
        height: 56px;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 var(--space-4);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-shrink: 0;
        text-decoration: none;
        color: var(--color-text);
      }
      .brand img {
        display: block;
        width: 26px;
        height: 26px;
        border-radius: var(--radius-sm, 6px);
      }
      .brand-title {
        font-size: var(--text-body, 15px);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex: 1;
        min-width: 0;
        justify-content: flex-end;
      }
      /* 주 메뉴 — 헤더 우측 inline 링크 (모바일은 가로 스크롤) */
      .nav {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .nav::-webkit-scrollbar {
        display: none;
      }
      .nav a {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        height: 32px;
        padding: 0 var(--space-2, 8px);
        border-radius: var(--radius-md, 8px);
        color: var(--color-muted);
        text-decoration: none;
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        letter-spacing: var(--tracking-tight);
        white-space: nowrap;
        transition: color 0.15s ease, background-color 0.15s ease;
      }
      .nav a:hover {
        color: var(--color-text);
        background: var(--color-surface);
      }
      .nav a.active {
        color: var(--color-primary);
        font-weight: 600;
      }
      /* 계정 메뉴 — 아바타 칩 + 드롭다운 (내 정보·로그아웃) */
      .account {
        position: relative;
        flex-shrink: 0;
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
        height: 32px;
        padding: 0 var(--space-3);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-md, 8px);
        background: transparent;
        color: var(--color-primary);
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-caption);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .btn-login:active {
        transform: scale(0.95);
      }
      .chip {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-shrink: 0;
        height: 32px;
        padding: 2px 10px 2px 3px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
        cursor: pointer;
        font-family: inherit;
        text-decoration: none;
        transition: background-color 0.15s ease, transform 0.15s ease;
      }
      .chip:hover {
        background: var(--color-bg);
      }
      .chip:active {
        transform: scale(0.96);
      }
      .chip.active {
        border-color: var(--color-primary);
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--radius-sm, 6px);
        background: var(--color-primary);
        color: var(--color-primary-text);
        font-size: var(--text-fine, 12px);
        font-weight: 600;
      }
      .chip-name {
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-text);
        font-size: var(--text-caption);
        font-weight: 500;
        letter-spacing: var(--tracking-tight);
      }
      @media (max-width: 560px) {
        .chip-name {
          display: none;
        }
        .chip {
          padding-right: 3px;
        }
        .brand-title {
          display: none;
        }
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: var(--space-4);
        padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
        font-size: var(--text-body);
        line-height: 1.47;
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
    window.removeEventListener("pointerdown", this.onGlobalPointerDown);
    window.removeEventListener("keydown", this.onGlobalKeydown);
    this.menuOpen = false;
  }

  // 주 메뉴 — 업무 메뉴만 헤더에 직접 노출하고,
  // 내 정보·로그아웃은 프로필 칩 드롭다운에 둔다
  private get navItems(): Array<{ href: string; label: string }> {
    if (!this.user) return [];
    const items = [{ href: "/my/rentals", label: "대여 내역" }];
    if (this.user.role === "admin") {
      items.push(
        { href: "/items/new", label: "물품 등록" },
        { href: "/admin/reservations", label: "대여 관리" },
        { href: "/admin/members", label: "회원 관리" },
      );
    }
    return items;
  }

  private isActive(href: string): boolean {
    const path = location.pathname;
    if (href === "/my/rentals") return path.startsWith("/my/rentals");
    if (href.startsWith("/admin")) return path.startsWith(href);
    return path === href;
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

  private get isProfileActive(): boolean {
    return location.pathname === "/mypage";
  }

  private get accountLabel(): string {
    return this.user?.name || this.user?.email || "";
  }
  private get accountInitial(): string {
    return this.accountLabel.trim().charAt(0).toUpperCase();
  }

  render() {
    return html`
      <header>
        <div class="row-main">
          <a href="/" class="brand" aria-label="홈 — 청년지부 물품 대여">
            <img src="/logo.png" alt="" />
            <span class="brand-title">물품 대여</span>
          </a>

          <div class="actions">
            ${this.user
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
                      class="chip ${this.isProfileActive ? "active" : ""}"
                      aria-haspopup="menu"
                      aria-expanded=${this.menuOpen}
                      ?aria-current=${this.isProfileActive ? "page" : null}
                      aria-label="계정 메뉴 — ${this.accountLabel}"
                      title="계정 메뉴"
                      @click=${() => (this.menuOpen = !this.menuOpen)}
                    >
                      <span class="avatar" aria-hidden="true">${this.accountInitial}</span>
                      <span class="chip-name">${this.accountLabel}</span>
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
                            <button
                              role="menuitem"
                              class="menu-logout"
                              @click=${this.signOut}
                            >
                              로그아웃
                            </button>
                          </div>
                        `
                      : ""}
                  </div>
                `
              : html`<a class="btn-login" href="/login">로그인</a>`}
          </div>
        </div>
      </header>
      <main>${this.router.outlet()}</main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
