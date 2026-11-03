import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reduceMotion } from "../styles/motion";
import { api } from "../api/client";
import "../components/ui/button";

// 소셜 로그인 (구글 전용)
// @auth/core 0.41은 GET signin/:provider를 지원하지 않으므로(UnknownAction),
// POST signin + CSRF 토큰으로 OAuth 리다이렉트 URL을 받은 뒤 full-page 이동한다.
@customElement("page-login")
export class PageLogin extends LitElement {
  @state() private busy = false;
  @state() private message = "";
  @state() private localTestLogin = false;
  @state() private developmentConfigured = false;
  @state() private developmentCode = "";

  // OAuth 콜백에서 로그인이 거부되면 ?error=와 함께 이 화면으로 돌아옴
  connectedCallback() {
    super.connectedCallback();
    void this.loadLocalTestLogin();
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "AccessDenied") {
      this.message = "정토회 계정(@jungto.org)으로 로그인해주세요";
      history.replaceState(null, "", window.location.pathname); // 새로고침 시 재표시 방지
    } else if (params.get("error") === "AccountDeactivated") {
      this.message = "탈퇴 처리된 계정이에요. 관리자에게 문의해주세요";
      history.replaceState(null, "", window.location.pathname);
    } else if (params.get("error") === "SessionUnavailable") {
      this.message = "로그인 상태를 확인할 수 없어요. 연결 상태를 확인하고 다시 시도해주세요";
      history.replaceState(null, "", window.location.pathname);
    }
  }

  private async loadLocalTestLogin() {
    try {
      const result = await api<{ enabled: boolean; configured?: boolean }>("/api/dev/login");
      this.localTestLogin = result.enabled;
      this.developmentConfigured = result.configured === true;
    } catch {
      this.localTestLogin = false;
    }
  }

  private async signInLocalTest(e: Event) {
    e.preventDefault();
    if (this.busy || !this.developmentConfigured) return;
    this.busy = true;
    this.message = "";
    try {
      await api("/api/dev/login", { method: "POST", body: JSON.stringify({ code: this.developmentCode }) });
      this.developmentCode = "";
      window.location.assign("/");
    } catch (err) {
      this.message = err instanceof Error ? err.message : "테스트 로그인에 실패했어요";
      this.busy = false;
    }
  }

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      /* 로그인은 셸 헤더·여백을 쓰지 않는 전체 화면 (main.plain) */
      .stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-height: 100dvh;
        padding: var(--space-3);
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 340px;
        text-align: center;
      }
      .brand {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .logo {
        display: block;
        width: 40px;
        height: 40px;
        object-fit: contain;
        border-radius: var(--radius);
      }
      h1 {
        margin: var(--space-1) 0 0;
        color: var(--ink-1);
        font-size: var(--text-page-title);
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        line-height: 1.35;
      }
      .sub {
        max-width: 280px;
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-body);
        line-height: var(--line-height);
      }

      /* 구글 로그인 — 브랜드색은 아이콘에만, 버튼은 조용한 흰 면 */
      .google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1);
        width: 100%;
        height: 40px;
        margin-top: var(--space-4);
        padding: 0 var(--space-2);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--ink-1);
        font-family: inherit;
        font-size: var(--text-body);
        font-weight: 500;
        line-height: var(--line-height-button);
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .google:hover:not(:disabled) {
        background: var(--surface-muted);
      }
      .google:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .google:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .google svg {
        width: 18px;
        height: 18px;
        flex: none;
      }

      .msg {
        margin: var(--space-1) 0 0;
        color: var(--danger);
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }
      .msg:empty {
        display: none;
      }
      .note {
        margin: var(--space-2) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }
      .note.hidden {
        display: none;
      }

      /* 로컬 개발 전용 — 실제 배포 화면에는 나타나지 않는다 */
      .dev {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        width: 100%;
        margin-top: var(--space-3);
        padding-top: var(--space-3);
        border-top: 1px dashed var(--border-strong);
      }
      .dev label {
        text-align: left;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .dev input {
        box-sizing: border-box;
        width: 100%;
        margin-top: var(--space-1);
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--ink-1);
        font: inherit;
        font-size: var(--text-body);
        line-height: var(--line-height-button);
      }
      .dev input:focus {
        outline: none;
        border-color: var(--primary);
      }

      footer {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        margin-top: var(--space-5);
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      footer a {
        color: var(--ink-2);
        text-decoration: none;
      }
      footer a:hover {
        color: var(--ink-1);
        text-decoration: underline;
      }
      footer span {
        color: var(--border-strong);
      }

      @media (min-width: 600px) {
        .logo {
          width: 48px;
          height: 48px;
        }
      }
    `,
  ];

  // Auth.js 표준 클라이언트 플로우: csrf → POST signin → {url} → 브라우저 이동
  private async signIn() {
    this.busy = true;
    this.message = "";
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

      const res = await fetch("/api/auth/signin/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: window.location.origin + "/",
        }),
      });
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("로그인 URL을 받지 못했어요");
      window.location.assign(url); // 구글 동의 화면으로 full-page 이동
    } catch (err) {
      this.message = err instanceof Error ? err.message : "로그인에 실패했어요";
      this.busy = false;
    }
  }

  render() {
    return html`
      <div class="stage">
        <div class="card">
          <div class="brand">
            <img class="logo" src="/logo.png" alt="" />
            <h1>물품 대여</h1>
            <p class="sub">필요한 물건을 빌리고,<br />다 쓰면 돌려주세요.</p>
          </div>

          <button class="google" ?disabled=${this.busy} @click=${this.signIn}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v2.98h3.88c2.27-2.09 3.54-5.17 3.54-8.8Z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.93l-3.88-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
            </svg>
            ${this.busy ? "이동 중…" : "Google로 계속하기"}
          </button>

          <p class="msg" role="alert" aria-live="polite">${this.message}</p>

          <p class="note ${this.message ? "hidden" : ""}">
            정토회 계정(@jungto.org)으로 로그인하면<br />바로 회원이 돼요.
          </p>

          ${this.localTestLogin
            ? html`<form class="dev" @submit=${this.signInLocalTest}>
                <label for="dev-code">테스트 접근 코드
                  <input id="dev-code" type="password" autocomplete="off" autocapitalize="off"
                    spellcheck="false" minlength="32" maxlength="128" required
                    placeholder="접근 코드 입력"
                    .value=${this.developmentCode}
                    @input=${(e: Event) => { this.developmentCode = (e.target as HTMLInputElement).value; }} />
                </label>
                ${!this.developmentConfigured
                  ? html`<p class="msg" role="status">.dev.vars에 무작위 DEV_LOGIN_CODE(32자 이상)를 설정하고 개발 서버를 다시 실행해주세요</p>` : ""}
                <x-button
                  variant="secondary"
                  type="submit"
                  ?loading=${this.busy}
                  ?disabled=${!this.developmentConfigured}
                >
                  로컬 테스트 관리자 로그인
                </x-button>
              </form>`
            : ""}
        </div>

        <footer>
          <a href="/policy/terms">이용약관</a>
          <span aria-hidden="true">·</span>
          <a href="/policy/privacy">개인정보처리방침</a>
        </footer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-login": PageLogin;
  }
}
