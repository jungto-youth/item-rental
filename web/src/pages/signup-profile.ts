import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "../context/session";
import { navigate } from "../router";
import { reduceMotion } from "../styles/motion";
import "../components/common/profile-form";

// 최초 로그인 후 이름·연락처 입력 (1회) — 입력欄은 profile-form 공용.
@customElement("page-signup-profile")
export class PageSignupProfile extends LitElement {
  @state() private name = "";
  @state() private phone = "";
  @state() private ready = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      profile-form {
        max-width: 360px;
        margin: var(--space-6, 32px) auto 0;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    const user = await session.ensure();
    this.name = user?.name ?? "";
    this.phone = user?.phone ?? "";
    this.ready = true;
  }

  render() {
    if (!this.ready) return html``;
    return html`
      <profile-form
        title="계정 정보"
        .initialName=${this.name}
        .initialPhone=${this.phone}
        @saved=${() => navigate("/mypage")}
      ></profile-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-signup-profile": PageSignupProfile;
  }
}
