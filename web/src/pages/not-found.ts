import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { navigate } from "../router";
import "../components/ui/button";

@customElement("page-not-found")
export class PageNotFound extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: var(--space-5) var(--space-3);
      text-align: center;
      box-sizing: border-box;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: var(--radius-pill);
      background: var(--surface-muted);
      color: var(--ink-3);
    }
    .icon svg {
      width: 28px;
      height: 28px;
    }

    .code {
      margin: var(--space-2) 0 0;
      color: var(--primary-strong);
      font-size: var(--text-fine);
      font-weight: 600;
    }
    h1 {
      margin: var(--space-1) 0 0;
      color: var(--ink-1);
      font-size: var(--text-page-title);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      line-height: 1.35;
    }
    .desc {
      max-width: 320px;
      margin: var(--space-1) 0 0;
      color: var(--ink-2);
      font-size: var(--text-body);
      line-height: var(--line-height);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-1);
      margin-top: var(--space-3);
    }
  `;

  private goBack() {
    if (window.history.length > 1) {
      history.back();
      return;
    }
    navigate("/");
  }

  render() {
    return html`
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      </span>

      <p class="code">404</p>
      <h1>페이지를 찾을 수 없어요</h1>
      <p class="desc">
        주소가 바뀌었거나 삭제된 페이지예요.<br />물품 현황으로 돌아가 볼까요?
      </p>

      <div class="actions">
        <x-button variant="primary" @click=${() => navigate("/")}>
          물품 현황으로
        </x-button>
        <x-button variant="secondary" @click=${this.goBack}>이전으로</x-button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-not-found": PageNotFound;
  }
}
