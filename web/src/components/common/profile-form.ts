import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../api/client";
import { session } from "../../context/session";
import { reduceMotion } from "../../styles/motion";
import "../ui/button";
import "../ui/input";

// 이름·연락처 폼 — 온보딩(/signup/profile)과 내 정보 수정(mypage) 공용.
// 같은 PUT /api/me/profile + 같은 검증이라 하나로 합쳤다.
// 저장은 이 컴포넌트가 끝까지 책임지고(세션 갱신 포함), 부모는 결과만 받는다:
// - `saved` — 저장 성공 (부모가 화면 전환·표시 모드 복귀)
// - `cancel` — cancellable일 때 취소 버튼
@customElement("profile-form")
export class ProfileForm extends LitElement {
  // 초기값 — 연결 시점에 내부 상태로 복사한다 (이후 부모가 바꿔도 덮지 않음)
  @property() initialName = "";
  @property() initialPhone = "";
  // 비우면 제목·힌트 없이 입력欄만 그린다 (인라인 수정용)
  @property() title = "";
  @property() hint = "대여 연락 목적으로만 사용돼요";
  @property() submitLabel = "저장";
  @property({ type: Boolean }) cancellable = false;

  @state() private name = "";
  @state() private phone = "";
  @state() private message = "";
  @state() private busy = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      .box {
        display: grid;
        gap: var(--space-3, 12px);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-5, 24px);
        box-sizing: border-box;
      }
      h2 {
        font-size: var(--text-heading, 1.0625rem);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      .hint {
        color: var(--color-muted);
        font-size: var(--text-caption, 13px);
        margin: 0;
      }
      .msg {
        color: var(--tone-danger-text, var(--color-danger));
        font-size: var(--text-fine, 12px);
        margin: 0;
        min-height: 1em;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2, 8px);
      }
      .actions.single {
        justify-content: stretch;
      }
      .actions.single x-button {
        flex: 1;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.name = this.initialName;
    this.phone = this.initialPhone;
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (this.busy) return;
    if (!this.name.trim() || !this.phone.trim()) {
      this.message = "이름과 연락처를 모두 입력해 주세요";
      return;
    }
    this.busy = true;
    this.message = "";
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ name: this.name, phone: this.phone }),
      });
      await session.refresh();
      this.dispatchEvent(new CustomEvent("saved", { bubbles: true, composed: true }));
    } catch (err) {
      this.message = err instanceof Error ? err.message : "저장에 실패했어요";
    } finally {
      this.busy = false;
    }
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <form class="box" @submit=${this.submit}>
        ${this.title ? html`<h2>${this.title}</h2>` : ""}
        ${this.hint ? html`<p class="hint">${this.hint}</p>` : ""}
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
        <p class="msg" aria-live="polite">${this.message}</p>
        <div class="actions ${this.cancellable ? "" : "single"}">
          ${this.cancellable
            ? html`<x-button
                variant="secondary"
                size="md"
                type="button"
                ?disabled=${this.busy}
                @click=${this.cancel}
              >
                취소
              </x-button>`
            : ""}
          <x-button variant="primary" size="md" type="submit" ?loading=${this.busy}>
            ${this.submitLabel}
          </x-button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "profile-form": ProfileForm;
  }
}
