import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRouter, navigate } from "./router";
import { session, type SessionUser } from "./context/session";
import { reduceMotion } from "./styles/motion";

// 테마 3단계(자동/라이트/다크) — tokens.css의 data-theme 셀렉터와 짝을 이룸.
// 저장값 'light'|'dark', 없으면 시스템 설정 따름.
type Theme = "system" | "light" | "dark";
const THEME_KEY = "theme";

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private theme: Theme = readStoredTheme();
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
      .nav-link {
        display: flex;
        align-items: center;
        height: 32px;
        padding: 0 10px;
        border-radius: var(--radius-md, 8px);
        color: var(--color-text);
        text-decoration: none;
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        transition: background-color 0.15s ease;
      }
      .nav-link:hover {
        background: var(--color-surface);
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
      .btn-logout:hover {
        color: var(--color-danger);
      }
      /* --- 관리자 서브 네비 (관리자 접속 시에만 노출) --- */
      .row-admin {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        box-sizing: border-box;
        height: 36px;
        padding: 0 var(--space-4);
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .row-admin::-webkit-scrollbar {
        display: none;
      }
      .admin-tag {
        font-size: var(--text-fine, 12px);
        font-weight: 600;
        color: var(--color-primary);
        flex-shrink: 0;
      }
      .row-admin a {
        color: var(--color-muted);
        text-decoration: none;
        font-size: var(--text-fine, 12px);
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .row-admin a:hover {
        color: var(--color-text);
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
    this.user = session.user;
    session.ensure();
    this.unsubscribe = session.subscribe(() => {
      this.user = session.user;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private setTheme(t: Theme) {
    this.theme = t;
    try {
      if (t === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      // 저장 불가 환경 대비
    }
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = t;
  }

  private cycleTheme() {
    const cycle: Record<Theme, Theme> = {
      system: "light",
      light: "dark",
      dark: "system",
    };
    this.setTheme(cycle[this.theme] || "light");
  }

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
    if (t === "light") {
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
    if (t === "dark") {
      return html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>`;
    }
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>`;
  }

  private get themeLabel(): string {
    if (this.theme === "light") return "라이트 모드";
    if (this.theme === "dark") return "다크 모드";
    return "테마 자동 (시스템)";
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
                    <a class="nav-link" href="/mypage">내 대여</a>
                    <button
                      class="chip"
                      title="마이페이지"
                      aria-label="마이페이지 — ${this.accountLabel}"
                      @click=${() => navigate("/mypage")}
                    >
                      <span class="avatar" aria-hidden="true">${this.accountInitial}</span>
                      <span class="chip-name">${this.accountLabel}</span>
                    </button>
                    <button
                      class="icon-btn btn-logout"
                      title="로그아웃"
                      aria-label="로그아웃"
                      @click=${this.signOut}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
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

        ${
          this.user && this.user.role === "admin"
            ? html`
                <div class="row-admin">
                  <span class="admin-tag">관리자</span>
                  <a href="/admin">대시보드</a>
                  <a href="/admin/reservations">대여 관리</a>
                  <a href="/admin/history">대여 이력</a>
                  <a href="/admin/members">회원 관리</a>
                </div>
              `
            : ""
        }
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
