import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reduceMotion } from "../../styles/motion";
import "../ui/empty";
import "../ui/button";
import "../ui/page-header";

// 관리자 페이지 골격 — 제목 → 툴바 → 결과 메시지 → 로딩·에러 또는 본문.
// 메뉴바는 없다 — 관리자 이동은 계정 메뉴(등록·대여관리·회원관리)와
// 화면 내 버튼이 맡는다. 페이지는 데이터와 본문만 슬롯으로 넣는다.
// - error: 로드 실패 — 재시도 버튼이 내장되고 @retry 이벤트를 발사한다
// - message: 결과 안내(성공·작업 완료·작업 실패) — error와 역할이 다르다(전체 페이지를
//   대체하지 않고 목록 위에 얹힌다). messageTone으로 성공/실패를 시각·시맨틱으로 구분한다.
// - 빈 목록 같은 본문 상태는 페이지 기본 슬롯의 책임으로 남긴다
@customElement("admin-page")
export class AdminPage extends LitElement {
  @property() title = "";
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
        color: var(--tone-primary-text);
        font-size: var(--text-caption, 13px);
        margin: 0 0 var(--space-2, 8px);
      }
      .msg.success {
        color: var(--tone-success-text, var(--color-primary));
      }
      .msg.error {
        color: var(--tone-danger-text, var(--color-danger));
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
      ${this.title ? html`<x-page-header title=${this.title}></x-page-header>` : ""}
      <slot name="toolbar"></slot>
      ${this.message
        ? html`<p
            class="msg ${tone}"
            role=${tone === "error" ? "alert" : "status"}
          >
            ${this.message}
          </p>`
        : ""}
      ${this.loading
        ? html`<x-empty compact state="loading"></x-empty>`
        : this.error
          ? html`<x-empty compact state="error" text=${this.error}>
              <x-button variant="secondary" size="sm" @click=${this.retry}>
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
