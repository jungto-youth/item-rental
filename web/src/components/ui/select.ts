import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type SelectOption = { value: string; label: string };

// 커스텀 드롭다운 — 계정 메뉴(app-shell .chip/.menu)와 같은 시각 언어로 통일한 선택 컨트롤.
// 네이티브 select 대신 트리거 버튼 + 드롭다운 패널로 렌더링해, 앱 전체 선택 UI를
// 서피스 배경·헤어라인 보더·8px 라운드·그림자로 일관되게 만든다.
// 닫기 패턴(외부 클릭/Esc)도 계정 메뉴와 동일.
@customElement("x-select")
export class XSelect extends LitElement {
    @property() value = "";
    @property() options: SelectOption[] = [];
    @property({ type: Boolean, reflect: true }) disabled = false;
    @property() placeholder = "선택";
    @property({ reflect: true }) size: "sm" | "md" | "lg" = "sm";

    @state() private open = false;

    static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }
    /* 트리거 — 계정 메뉴 .chip 과 동일 조형 */
    .trigger {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .trigger:hover:not(:disabled) {
      background: var(--color-bg);
      border-color: var(--color-muted);
    }
    .trigger:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .trigger:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: 1px;
    }
    .trigger.open {
      background: var(--color-bg);
      border-color: var(--color-primary);
    }
    .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
      letter-spacing: var(--tracking-tight);
    }
    .label.placeholder {
      color: var(--color-muted);
      font-weight: 400;
    }
    /* 크기 스케일 */
    .size-sm {
      height: 32px;
      padding: 0 12px;
      font-size: var(--text-caption, 13px);
    }
    .size-md {
      height: 40px;
      padding: 0 14px;
      font-size: var(--text-body, 15px);
    }
    .size-lg {
      height: 44px;
      padding: 0 14px;
      font-size: var(--text-body, 15px);
    }
    /* 드롭다운 패널 — 계정 메뉴 .menu 와 동일 조형 */
    .menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      min-width: 100%;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      z-index: 30;
      animation: menuIn 0.12s ease-out;
    }
    .menu button {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      text-align: left;
      background: none;
      border: none;
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--text-caption, 13px);
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .menu button:hover {
      background: var(--color-bg);
    }
    .menu button.on {
      color: var(--color-primary);
      font-weight: 600;
    }
    .menu button:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: -2px;
    }
    .check {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      margin-left: auto;
      color: var(--color-primary);
    }
    @keyframes menuIn {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener("pointerdown", this.onGlobalPointerDown);
        window.addEventListener("keydown", this.onGlobalKeydown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener("pointerdown", this.onGlobalPointerDown);
        window.removeEventListener("keydown", this.onGlobalKeydown);
        this.open = false;
    }

    // 계정 메뉴와 동일 — 외부 클릭이나 Esc로 닫는다
    private onGlobalPointerDown = (e: PointerEvent) => {
        if (!this.open) return;
        if (!e.composedPath().includes(this)) this.open = false;
    };

    private onGlobalKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") this.open = false;
    };

    private toggle() {
        if (this.disabled) return;
        this.open = !this.open;
    }

    private select(v: string) {
        if (v === this.value) {
            this.open = false;
            return;
        }
        this.value = v;
        this.open = false;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: { value: v },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private get currentLabel(): string {
        return this.options.find((o) => o.value === this.value)?.label ?? "";
    }

    render() {
        const label = this.currentLabel;
        return html`
      <button
        type="button"
        class="trigger size-${this.size} ${this.open ? "open" : ""}"
        aria-haspopup="listbox"
        aria-expanded=${this.open}
        ?disabled=${this.disabled}
        @click=${this.toggle}
      >
        <span class="label ${label ? "" : "placeholder"}">${label || this.placeholder}</span>
      </button>
      ${this.open
                ? html`
            <div class="menu" role="listbox">
              ${this.options.map(
                    (o) => html`
                  <button
                    type="button"
                    role="option"
                    aria-selected=${o.value === this.value}
                    class=${o.value === this.value ? "on" : ""}
                    @click=${() => this.select(o.value)}
                  >
                    ${o.label}
                    ${o.value === this.value
                            ? html`<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>`
                            : ""}
                  </button>
                `,
                )}
            </div>
          `
                : ""}
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "x-select": XSelect;
    }
}