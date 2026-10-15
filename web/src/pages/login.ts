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

  // OAuth 콜백에서 로그인이 거부되면 ?error=와 함께 이 화면으로 돌아옴 ()
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
      const result = await api<{ enabled: boolean }>("/api/dev/login");
      this.localTestLogin = result.enabled;
    } catch {
      this.localTestLogin = false;
    }
  }

  private async signInLocalTest() {
    if (this.busy) return;
    this.busy = true;
    this.message = "";
    try {
      await api("/api/dev/login", { method: "POST" });
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
      /* 세로 중앙 정렬 — 104px는 app-shell의 헤더(56) + main 위아래 패딩(16+32).
         이 div에 세로 패딩을 더하면 main 패딩과 중복되어 화면이 넘치므로
         여백은 main이 이미 준다. 화면 높이를 104px 뺀 값이라 app-shell
         레이아웃과 함께 바뀐다. */
      .stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: calc(100dvh - 104px);
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-4);
        width: 100%;
        max-width: 400px;
        text-align: center;
      }
      .brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
      }
      .logo {
        display: block;
        width: 48px;
        height: 48px;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        line-height: 1.2;
      }
      .sub {
        margin: 0;
        font-size: 1rem;
        color: var(--color-muted);
        line-height: 1.4;
      }
      x-button {
        width: 100%;
        --x-button-font-size: 1rem;
        --x-button-weight: 700;
      }
      .msg {
        margin: 0;
        color: var(--tone-danger-text);
        font-size: var(--text-fine);
        line-height: 1.4;
      }
      /* 오류가 없을 때는 흐름에서 빼내 버튼과의 16px 간격도 함께 사라지게 한다 */
      .msg:empty {
        display: none;
      }
      .foot {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .foot p {
        margin: 0;
        color: var(--color-muted);
        font-size: var(--text-fine);
        line-height: 1.4;
      }
      .foot a {
        color: inherit;
        margin: 0 var(--space-1);
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
            <p class="sub">물품 대여 현황 관리 시스템</p>
          </div>

          ${this.localTestLogin
            ? html`<x-button variant="primary" size="md" ?loading=${this.busy} @click=${this.signInLocalTest}>
                ${this.busy ? "이동 중…" : "로컬 테스트 관리자 로그인"}
              </x-button>`
            : html`<x-button variant="primary" size="md" ?loading=${this.busy} @click=${this.signIn}>
                ${this.busy ? "이동 중…" : "Google로 로그인"}
              </x-button>`}

          <p class="msg" aria-live="polite">${this.message}</p>

          <div class="foot">
            <p>${this.localTestLogin
              ? "로컬 사진 테스트 · 테스트 관리자 계정으로 로그인할 수 있어요"
              : "정토회(@jungto.org) 구글 계정으로 로그인하면 바로 물품을 대여할 수 있어요"}</p>
            <p>
              <a href="/policy/privacy">개인정보처리방침</a>·<a href="/policy/terms"
                >이용약관</a
              >
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-login": PageLogin;
  }
}
