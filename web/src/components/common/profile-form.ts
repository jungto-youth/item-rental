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
  // 비우면 제목·힌트 없이 입력란만 그린다 (인라인 수정용)
  @property() title = "";
  @property() hint = "대여 연락 목적으로만 사용돼요";
  @property() submitLabel = "저장";
  @property({ type: Boolean }) cancellable = false;
  // 로그인한 계정 — 값이 있으면 폼 맨 위에 계정 확인 줄을 그린다
  @property() email = "";
  @property() accountLabel = "이메일";
  // 수정 모드 — 아바타 + 제목을 카드 안에 함께 보여준다
  @property({ type: Boolean }) avatar = false;
  // 저장 버튼 아래 안내
  @property() note = "";

  @state() private name = "";
  @state() private phone = "";
  @state() private nameError = "";
  @state() private phoneError = "";
  @state() private message = "";
  @state() private busy = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      .box {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: var(--space-3);
        box-sizing: border-box;
      }
      @media (max-width: 639px) {
        .box {
          padding: var(--space-2);
        }
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        flex: none;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-body);
        font-weight: 600;
      }
      h2 {
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      .hint {
        color: var(--ink-2);
        font-size: var(--text-fine);
        margin: var(--space-1) 0 0;
      }
      .account {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius);
        background: var(--surface-muted);
        color: var(--ink-2);
        font-size: var(--text-fine);
        box-sizing: border-box;
      }
      .account span:last-child {
        color: var(--ink-1);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .field-error {
        margin: 0;
        color: var(--danger);
        font-size: var(--text-fine);
        line-height: var(--line-height);
      }
      .msg {
        color: var(--danger);
        font-size: var(--text-fine);
        margin: 0;
      }
      .msg:empty {
        display: none;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-1);
        margin-top: var(--space-1);
      }
      .actions.single x-button {
        flex: 1;
      }
      .note {
        margin: 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
        line-height: var(--line-height);
        text-align: center;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.name = this.initialName;
    this.phone = this.initialPhone;
  }

  private get initial(): string {
    return (this.name || this.email).trim().charAt(0).toUpperCase();
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (this.busy) return;
    this.nameError = this.name.trim() ? "" : "이름을 입력해 주세요";
    this.phoneError = this.phone.trim() ? "" : "연락처를 입력해 주세요";
    if (this.nameError || this.phoneError) return;

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

  // Shadow DOM inputs cannot implicitly submit their outer form.
  private submitOnEnter(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.isComposing || e.defaultPrevented) return;
    if (!(e.composedPath()[0] instanceof HTMLInputElement)) return;
    e.preventDefault();
    (e.currentTarget as HTMLFormElement).requestSubmit();
  }

  render() {
    const heading = this.title
      ? html`
          <div class="head">
            ${this.avatar ? html`<span class="avatar" aria-hidden="true">${this.initial}</span>` : ""}
            <div>
              <h2>${this.title}</h2>
              ${this.hint ? html`<p class="hint">${this.hint}</p>` : ""}
            </div>
          </div>
        `
      : this.hint
        ? html`<p class="hint">${this.hint}</p>`
        : "";

    return html`
      <form class="box" @submit=${this.submit} @keydown=${this.submitOnEnter}>
        ${heading}
        ${this.email
          ? html`<div class="account">
              <span>${this.accountLabel}</span>
              <span title=${this.email}>${this.email}</span>
            </div>`
          : ""}

        <div class="field">
          <x-input
            label="이름 *"
            required
            ?invalid=${!!this.nameError}
            .value=${this.name}
            @input=${(e: Event) => {
              this.name = (e.target as HTMLInputElement).value;
              if (this.name.trim()) this.nameError = "";
            }}
          ></x-input>
          ${this.nameError ? html`<p class="field-error" role="alert">${this.nameError}</p>` : ""}
        </div>

        <div class="field">
          <x-input
            label="휴대폰 번호 *"
            type="tel"
            inputmode="tel"
            placeholder="010-1234-5678"
            required
            ?invalid=${!!this.phoneError}
            .value=${this.phone}
            @input=${(e: Event) => {
              this.phone = (e.target as HTMLInputElement).value;
              if (this.phone.trim()) this.phoneError = "";
            }}
          ></x-input>
          ${this.phoneError ? html`<p class="field-error" role="alert">${this.phoneError}</p>` : ""}
        </div>

        <p class="msg" aria-live="polite">${this.message}</p>

        <div class="actions ${this.cancellable ? "" : "single"}">
          ${this.cancellable
            ? html`<x-button
                variant="secondary"
                type="button"
                ?disabled=${this.busy}
                @click=${this.cancel}
              >
                취소
              </x-button>`
            : ""}
          <x-button variant="primary" type="submit" ?loading=${this.busy}>
            ${this.submitLabel}
          </x-button>
        </div>
        ${this.note ? html`<p class="note">${this.note}</p>` : ""}
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "profile-form": ProfileForm;
  }
}
