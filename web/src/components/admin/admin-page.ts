import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reduceMotion } from "../../styles/motion";
import "../ui/empty";
import "../ui/button";
import "../ui/page-header";

// 관리자 페이지 골격 — 제목 → 툴바 → 결과 메시지 → 로딩·에러 또는 본문.
// 관리자 이동은 상단 메뉴와 화면 내 버튼이 맡는다. 페이지는 데이터와 본문만 슬롯으로 넣는다.
// - error: 로드 실패 — 재시도 버튼이 내장되고 @retry 이벤트를 발사한다
// - message: 결과 안내(성공·작업 완료·작업 실패) — error와 역할이 다르다(전체 페이지를
//   대체하지 않고 목록 위에 얹힌다). messageTone으로 성공/실패를 시각·시맨틱으로 구분한다.
// - 빈 목록 같은 본문 상태는 페이지 기본 슬롯의 책임으로 남긴다
@customElement("admin-page")
export class AdminPage extends LitElement {
  @property() title = "";
  @property() subtitle = "";
  @property({ type: Boolean }) loading = false;
  @property() error = "";
  @property() message = "";
  // message의 성격 — 실패를 message로 보낼 때 "error"를 같이 줘야 사용자가
  // 성공과 구분할 수 있다(색만 다르게, 오류는 assertive로 읽는다)
  @property() messageTone: "info" | "success" | "error" = "info";

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      .msg {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--ink-1);
        font-size: var(--text-fine);
        margin: var(--space-1) 0 0;
      }
      .msg svg {
        width: 16px;
        height: 16px;
        flex: none;
        color: var(--primary-strong);
      }
      .msg.error {
        color: var(--danger);
      }
      .msg.error svg {
        color: var(--danger);
      }
    `,
  ];

  private retry() {
    this.dispatchEvent(
      new CustomEvent("retry", { bubbles: true, composed: true }),
    );
  }

  render() {
    const tone = this.messageTone;
    return html`
      ${this.title
        ? html`<x-page-header
            title=${this.title}
            subtitle=${this.subtitle}
          ></x-page-header>`
        : ""}
      <slot name="toolbar"></slot>
      ${this.message
        ? html`<p
            class="msg ${tone}"
            role=${tone === "error" ? "alert" : "status"}
          >
            ${tone === "success"
              ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>`
              : ""}
            <span>${this.message}</span>
          </p>`
        : ""}
      ${this.loading
        ? html`<x-empty compact state="loading"></x-empty>`
        : this.error
          ? html`<x-empty compact state="error" text=${this.error}>
              <x-button variant="secondary" @click=${this.retry}>
                다시 시도
              </x-button>
            </x-empty>`
          : html`<slot></slot>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "admin-page": AdminPage;
  }
}
