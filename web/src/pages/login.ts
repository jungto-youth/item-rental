import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reduceMotion } from "../styles/motion";
import "../components/ui/button";

// SPEC §7.2 — 소셜 로그인 (구글 전용)
// @auth/core 0.41은 GET signin/:provider를 지원하지 않으므로(UnknownAction),
// POST signin + CSRF 토큰으로 OAuth 리다이렉트 URL을 받은 뒤 full-page 이동한다.
@customElement("page-login")
export class PageLogin extends LitElement {
  @state() private busy = false;
  @state() private message = "";

  // OAuth 콜백에서 로그인이 거부되면 ?error=와 함께 이 화면으로 돌아옴 (§7.2)
  connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "AccessDenied") {
      this.message = "정토회 계정(@jungto.org)으로 로그인해주세요";
      history.replaceState(null, "", window.location.pathname); // 새로고침 시 재표시 방지
    }
  }

  static styles = [
    reduceMotion,
    css`
      div {
        text-align: center;
        padding: var(--space-6) 0;
      }
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      p {
        color: var(--color-muted);
        font-size: var(--text-caption);
        line-height: 1.47;
      }
      .btn-wrap {
        margin: var(--space-4) auto 0;
        max-width: 260px;
        width: 100%;
      }
      .msg {
        color: var(--tone-danger-text);
        font-size: var(--text-fine);
      }
      .links {
        margin-top: var(--space-4);
        font-size: var(--text-fine);
      }
      .links a {
        color: var(--color-muted);
        margin: 0 var(--space-2);
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
      <div>
        <h1>로그인</h1>
        <p>
          정토회 구글 계정으로 로그인하면 바로 물품을 대여할 수 있어요
        </p>
        <div class="btn-wrap">
          <x-button variant="primary" size="md" ?loading=${this.busy} @click=${this.signIn}>
            ${this.busy ? "이동 중…" : "구글로 로그인"}
          </x-button>
        </div>
        <p class="msg">${this.message}</p>
        <p class="links">
          <a href="/policy/privacy">개인정보처리방침</a>·<a href="/policy/terms"
            >이용약관</a
          >
        </p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-login": PageLogin;
  }
}
