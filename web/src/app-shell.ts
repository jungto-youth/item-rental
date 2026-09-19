import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRouter, navigate } from "./router";
import { session, type SessionUser } from "./context/session";
import { reduceMotion } from "./styles/motion";

// 테마 2단계(라이트/다크) — tokens.css의 data-theme 셀렉터와 짝을 이룸.
// 저장값 없으면 시스템 설정을 최초 1회 따르고, 이후 토글 버튼으로 전환한다.
type Theme = "light" | "dark";
const THEME_KEY = "theme";

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    // 저장 불가 환경 대비
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private theme: Theme = readStoredTheme();
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
        height: 48px;
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
      }
      /* 계정 메뉴 — 아바타 칩 + 드롭다운 */
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
        transition: background-color 0.15s ease, transform 0.15s ease;
      }
      .chip:hover {
        background: var(--color-bg);
      }
      .chip:active {
        transform: scale(0.96);
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
        font-size: 11px;
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
      .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        padding: 0;
        background: none;
        border: 1px solid transparent;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        color: var(--color-muted);
        transition: color 0.15s ease, background-color 0.15s ease;
      }
      .icon-btn:hover {
        color: var(--color-text);
        background: var(--color-surface);
      }
      .icon-btn svg {
        width: 16px;
        height: 16px;
        display: block;
      }
      @media (max-width: 560px) {
        .chip-name {
          display: none;
        }
        .chip {
          padding-right: 3px;
        }
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: var(--space-4);
        font-size: var(--text-body);
        line-height: 1.47;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.applyTheme(this.theme); // 저장값(또는 시스템)을 최초 1회 적용
    this.user = session.user;
    session.ensure();
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

  private applyTheme(t: Theme) {
    this.theme = t;
    document.documentElement.dataset.theme = t;
  }

  private cycleTheme() {
    this.applyTheme(this.theme === "light" ? "dark" : "light");
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch {
      // 저장 불가 환경 대비
    }
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
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // 네트워크 오류 무시
    }
    session.clear();
    await session.refresh();
    navigate("/");
  }

  private themeIcon(t: Theme) {
    if (t === "dark") {
      return html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>`;
    }
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>`;
  }

  private get themeLabel(): string {
    return this.theme === "dark" ? "다크 모드" : "라이트 모드";
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
            ${
              this.user
                ? html`
                    <div class="account">
                      <button
                        class="chip"
                        aria-haspopup="menu"
                        aria-expanded=${this.menuOpen}
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
                              <a
                                role="menuitem"
                                href="/my/rentals"
                                @click=${() => (this.menuOpen = false)}
                              >
                                대여 내역
                              </a>
                              ${this.user.role === "admin"
                                ? html`
                                    <a
                                      role="menuitem"
                                      href="/admin"
                                      @click=${() => (this.menuOpen = false)}
                                    >
                                      관리자
                                    </a>
                                  `
                                : ""}
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
                : html`<a class="btn-login" href="/login">로그인</a>`
            }

            <button
              type="button"
              class="icon-btn"
              aria-label="테마 전환: 현재 ${this.themeLabel}"
              title="테마 전환: 현재 ${this.themeLabel}"
              @click=${this.cycleTheme}
            >
              ${this.themeIcon(this.theme)}
            </button>
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
