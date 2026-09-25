import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { numberInputCss } from "../../styles/controls";

// 라벨 + 입력 필드 — 페이지마다 흩어져 있던 input 스타일(높이·라운드·포커스)을 통일한다.
// Form-Associated Custom Element: required 검증이 내부 input의 shadow에 묻히지 않도록
// elementInternals로 폼 제출에 직접 참여한다 (44px 터치 타깃).
@customElement("x-input")
export class XInput extends LitElement {
  static formAssociated = true;

  @property({ reflect: true }) label = "";
  @property({ reflect: true }) type: string = "text";
  @property({ reflect: true }) placeholder = "";
  @property() value = "";
  @property({ reflect: true }) size: "sm" | "md" = "md";
  @property({ type: Boolean, reflect: true }) required = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  // type="textarea"일 때 행 수
  @property({ type: Number }) rows = 2;
  // type="number"일 때 최솟값 — 네이티브 전달용(스피너·키보드 힌트), 폼 검증은 required 범위만
  @property() min = "";
  // 모바일 키보드 힌트("numeric" 등)
  @property() inputmode = "";

  private internals = this.attachInternals();

  static styles = [
    numberInputCss,
    css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    label {
      font-size: var(--text-caption, 13px);
      color: var(--color-muted);
      font-weight: 500;
    }
    .control {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: inherit;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }
    .control::placeholder {
      color: var(--color-muted);
    }
    .control:focus {
      outline: none;
      border-color: var(--color-primary);
      background: var(--color-bg);
    }
    .control:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: 1px;
    }
    .control:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .size-md {
      height: 44px;
      padding: 0 14px;
      font-size: var(--text-body, 15px);
    }
    .size-sm {
      height: 36px;
      padding: 0 12px;
      font-size: var(--text-caption, 13px);
    }
    /* textarea — 고정 높이 대신 세로 확장 */
    textarea.control {
      height: auto;
      padding: 10px 14px;
      font-size: var(--text-body, 15px);
      line-height: 1.5;
      resize: vertical;
      min-height: 60px;
    }
  `,
  ];

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (changed.has("value")) {
      this.internals.setFormValue(this.value);
    }
    if (changed.has("value") || changed.has("required") || changed.has("disabled")) {
      this.validate();
    }
  }

  private validate() {
    const input = this.renderRoot.querySelector("input, textarea") as HTMLElement | null;
    if (this.required && this.value.trim() === "") {
      this.internals.setValidity({ valueMissing: true }, "필수 입력 항목이에요", input ?? undefined);
    } else {
      this.internals.setValidity({});
    }
  }

  private onInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent("input", { bubbles: true, composed: true }));
  }

  render() {
    return html`
      ${this.label ? html`<label for="control">${this.label}</label>` : ""}
      ${this.type === "textarea"
        ? html`<textarea
            id="control"
            class="control"
            rows=${this.rows}
            placeholder=${this.placeholder}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${this.onInput}
          ></textarea>`
        : html`<input
            id="control"
            class="control size-${this.size}"
            type=${this.type}
            min=${this.min || undefined}
            inputmode=${this.inputmode || undefined}
            placeholder=${this.placeholder}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${this.onInput}
          />`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-input": XInput;
  }
}