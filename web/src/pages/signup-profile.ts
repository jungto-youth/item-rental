import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../api/client'
import { session } from '../context/session'
import { navigate } from '../router'

// SPEC §4.1 — 최초 로그인 후 이름·연락처 입력 (1회)
@customElement('page-signup-profile')
export class PageSignupProfile extends LitElement {
  @state() private name = ''
  @state() private phone = ''
  @state() private message = ''
  @state() private busy = false

  static styles = css`
    form {
      display: grid;
      gap: var(--space-3);
      max-width: 360px;
      margin: var(--space-6) auto 0;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-4);
    }
    label { font-size: 0.75rem; color: var(--color-muted); display: grid; gap: 4px; }
    input {
      height: 44px; /* DESIGN.md §1 — 터치 타깃 */
      padding: 0 var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: 0.95rem;
      font-family: inherit;
      box-sizing: border-box;
      width: 100%;
    }
    input:focus { outline: none; border-color: var(--color-primary); }
    button {
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: 0;
      border-radius: var(--radius);
      height: 44px; /* DESIGN.md §1 — 터치 타깃 */
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: inherit;
    }
    button:hover:not(:disabled) { opacity: 0.9; }
    button:disabled { opacity: 0.6; cursor: default; }
    .msg { color: var(--color-danger); font-size: 0.8rem; margin: 0; min-height: 1em; }
    p.hint { color: var(--color-muted); font-size: 0.8rem; margin: 0; }
  `

  async connectedCallback() {
    super.connectedCallback()
    const user = await session.ensure()
    this.name = user?.name ?? ''
    this.phone = user?.phone ?? ''
  }

  private async submit(e: Event) {
    e.preventDefault()
    this.busy = true
    this.message = ''
    try {
      await api('/api/me/profile', { method: 'PUT', body: JSON.stringify({ name: this.name, phone: this.phone }) })
      await session.refresh()
      navigate('/mypage')
    } catch (err) {
      this.message = err instanceof Error ? err.message : '저장 실패'
    } finally {
      this.busy = false
    }
  }

  render() {
    return html`
      <form @submit=${this.submit}>
        <h2>프로필 입력</h2>
        <p class="hint">대여 연락 목적으로만 사용돼요</p>
        <label>이름
          <input required .value=${this.name} @input=${(e: Event) => (this.name = (e.target as HTMLInputElement).value)} />
        </label>
        <label>휴대폰 번호
          <input required type="tel" placeholder="010-1234-5678" .value=${this.phone}
                 @input=${(e: Event) => (this.phone = (e.target as HTMLInputElement).value)} />
        </label>
        <p class="msg">${this.message}</p>
        <button type="submit" ?disabled=${this.busy}>저장</button>
      </form>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-signup-profile': PageSignupProfile
  }
}
