import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "../context/session";
import { navigate } from "../router";
import { reduceMotion } from "../styles/motion";
import "../components/common/profile-form";

// 최초 로그인 후 이름·연락처 입력 (1회) — 입력란은 profile-form 공용.
@customElement("page-signup-profile")
export class PageSignupProfile extends LitElement {
  @state() private name = "";
  @state() private phone = "";
  @state() private email = "";
  @state() private ready = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
        max-width: var(--layout-onboarding);
        margin: 0 auto;
        /* 셸 헤더가 없는 전체 화면이라 여백을 직접 갖는다 */
        padding: var(--space-4) var(--space-3);
        box-sizing: border-box;
      }
      .head {
        text-align: center;
      }
      h1 {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-page-title);
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        line-height: 1.35;
      }
      .sub {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-body);
        line-height: var(--line-height);
      }
      profile-form {
        margin-top: var(--space-3);
      }
      .privacy {
        margin: var(--space-2) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
        text-align: center;
      }
      /* 헤더가 없는 전체 화면 — 계정 전환 출구와 정책 링크를 화면 안에 둔다 */
      .alt {
        margin: var(--space-3) 0 0;
        text-align: center;
      }
      .alt a,
      .policy a {
        color: var(--ink-2);
        font-size: var(--text-fine);
        text-decoration: none;
      }
      .alt a:hover,
      .policy a:hover {
        color: var(--ink-1);
        text-decoration: underline;
      }
      .policy {
        display: flex;
        justify-content: center;
        gap: var(--space-2);
        margin: var(--space-2) 0 0;
        color: var(--ink-3);
        font-size: var(--text-fine);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    const user = await session.ensure();
    this.name = user?.name ?? "";
    this.phone = user?.phone ?? "";
    this.email = user?.email ?? "";
    this.ready = true;
  }

  render() {
    if (!this.ready) return html``;
    return html`
      <div class="head">
        <h1>반가워요</h1>
        <p class="sub">물품을 빌리려면 이름과 연락처가 필요해요.</p>
      </div>

      <profile-form
        .initialName=${this.name}
        .initialPhone=${this.phone}
        .email=${this.email}
        accountLabel="로그인한 계정"
        hint=""
        note="저장하면 바로 물품을 둘러볼 수 있어요."
        @saved=${() => navigate("/mypage")}
      ></profile-form>

      <p class="privacy">입력한 정보는 물품 대여 연락에만 사용해요.</p>

      <p class="alt"><a href="/login">다른 계정으로 로그인</a></p>

      <nav class="policy" aria-label="정책">
        <a href="/policy/terms">이용약관</a>
        <span aria-hidden="true">·</span>
        <a href="/policy/privacy">개인정보처리방침</a>
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-signup-profile": PageSignupProfile;
  }
}
