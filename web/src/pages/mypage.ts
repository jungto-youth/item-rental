import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

// SPEC §4.1 — 마이페이지 (4주차 구현)
@customElement('page-mypage')
export class PageMypage extends LitElement {
  static styles = css`
    p { color: var(--color-muted); }
  `

  render() {
    return html`
      <h1>마이페이지</h1>
      <p>대여 중 / 승인 대기 / 대여 예정 / 이력 — 4주차 구현 예정</p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-mypage': PageMypage
  }
}
