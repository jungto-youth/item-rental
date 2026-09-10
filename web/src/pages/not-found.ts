import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('page-not-found')
export class PageNotFound extends LitElement {
  static styles = css`
    div { text-align: center; padding: var(--space-6) 0; color: var(--color-muted); font-size: var(--text-caption); }
    h1 { font-size: 2.5rem; font-weight: 600; letter-spacing: var(--tracking-tight); color: var(--color-text); margin: 0 0 var(--space-2); }
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
