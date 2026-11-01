import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('page-not-found')
export class PageNotFound extends LitElement {
  static styles = css`
    div { text-align: center; padding: var(--space-4) 0; color: var(--ink-2); font-size: var(--text-fine); }
    h1 { font-size: var(--text-page-title); font-weight: 600; letter-spacing: var(--tracking-tight); color: var(--ink-1); margin: 0 0 var(--space-1); }
    p { margin: 0; }
  `

  render() {
    return html`<div><h1>404</h1><p>페이지를 찾을 수 없어요</p></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-not-found': PageNotFound
  }
}
