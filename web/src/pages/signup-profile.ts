import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session } from "../context/session";
import { navigate } from "../router";
import { reduceMotion } from "../styles/motion";
import "../components/ui/button";
import "../components/ui/input";

// SPEC §4.1 — 최초 로그인 후 이름·연락처 입력 (1회)
@customElement("page-signup-profile")
export class PageSignupProfile extends LitElement {
  @state() private name = "";
  @state() private phone = "";
  @state() private message = "";
  @state() private busy = false;

  static styles = [
    reduceMotion,
    css`
      form {
        display: grid;
        gap: var(--space-3);
        max-width: 360px;
        margin: var(--space-6) auto 0;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-5);
      }
      h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      .msg {
        color: var(--tone-danger-text);
        font-size: var(--text-fine);
        margin: 0;
        min-height: 1em;
      }
      p.hint {
        color: var(--color-muted);
        font-size: var(--text-caption);
        margin: 0;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    const user = await session.ensure();
    this.name = user?.name ?? "";
    this.phone = user?.phone ?? "";
  }

  private async submit(e: Event) {
    e.preventDefault();
    this.busy = true;
    this.message = "";
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ name: this.name, phone: this.phone }),
      });
      await session.refresh();
      navigate("/mypage");
    } catch (err) {
      this.message = err instanceof Error ? err.message : "저장 실패";
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <form @submit=${this.submit}>
        <h2>계정 정보</h2>
        <p class="hint">대여 연락 목적으로만 사용돼요</p>
        <x-input
          label="이름"
          required
          .value=${this.name}
          @input=${(e: Event) => (this.name = (e.target as HTMLInputElement).value)}
        ></x-input>
        <x-input
          label="휴대폰 번호"
          type="tel"
          placeholder="010-1234-5678"
          required
          .value=${this.phone}
          @input=${(e: Event) => (this.phone = (e.target as HTMLInputElement).value)}
        ></x-input>
        <p class="msg">${this.message}</p>
        <x-button variant="primary" size="md" type="submit" ?loading=${this.busy}>
          저장
        </x-button>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-signup-profile": PageSignupProfile;
  }
}
