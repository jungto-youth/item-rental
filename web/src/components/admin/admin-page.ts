import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AdminTab } from "./admin-nav";
import { reduceMotion } from "../../styles/motion";
import "./admin-nav";
import "../ui/empty";
import "../ui/button";
import "../ui/page-header";

// 관리자 페이지 골격 — admin-nav → 페이지 헤더(+액션) → 툴바 → 결과 메시지 →
// 로딩·에러 전용 렌더 또는 본문,의 순서를 셸 하나가 소유한다.
// 페이지는 데이터와 본문(목록·빈 상태·폼)만 슬롯으로 넣는다. 골격을 각자 조립하던
// 이전 패턴(헤더 위치·재시도 유무가 페이지마다 달랐던)을 구조적으로 막는 용도다.
// - error: 로드 실패 — 재시도 버튼이 내장되고 @retry 이벤트를 발사한다
// - message: 결과 안내(성공·작업 완료) — error와 역할이 다르다
// - 빈 목록 같은 본문 상태는 페이지 기본 슬롯의 책임으로 남긴다
@customElement("admin-page")
export class AdminPage extends LitElement {
  @property({ reflect: true }) active: AdminTab = "dashboard";
  @property() title = "";
  @property() subtitle = "";
  @property({ type: Boolean }) loading = false;
  @property() error = "";
  @property() message = "";

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      .msg {
        color: var(--color-primary);
        font-size: var(--text-caption, 13px);
        min-height: 1.2em;
        margin: 0 0 var(--space-2, 8px);
      }
    `,
  ];

  private retry() {
    this.dispatchEvent(
      new CustomEvent("retry", { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <admin-nav active=${this.active}></admin-nav>
      <x-page-header title=${this.title} subtitle=${this.subtitle}>
        <slot name="action" slot="action"></slot>
      </x-page-header>
      <slot name="toolbar"></slot>
      <p class="msg" aria-live="polite">${this.message}</p>
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
