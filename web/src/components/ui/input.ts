import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { numberInputCss } from "../../styles/ui";

// 라벨 + 입력 필드 — 페이지마다 흩어져 있던 input 스타일(높이·라운드·포커스)을 통일한다.
// Form-Associated Custom Element: required 검증이 내부 input의 shadow에 묻히지 않도록
// elementInternals로 폼 제출에 직접 참여한다 (40px 터치 타깃).
@customElement("x-input")
export class XInput extends LitElement {
  static formAssociated = true;

  @property({ reflect: true }) label = "";
  @property({ reflect: true }) type: string = "text";
  @property({ reflect: true }) placeholder = "";
  @property() value = "";
  @property({ type: Boolean, reflect: true }) required = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  // 필드 오류 — 테두리만 위험색으로. 문구는 사용처가 소유한다
  @property({ type: Boolean, reflect: true }) invalid = false;
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
      gap: var(--space-1);
      width: 100%;
      box-sizing: border-box;
    }
    label {
      font-size: var(--text-fine);
      color: var(--ink-2);
      font-weight: 400;
    }
    .control {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink-1);
      font-family: inherit;
      line-height: var(--line-height-button);
    }
    .control::placeholder {
      color: var(--ink-2);
    }
    .control:focus {
      outline: none;
      border-color: var(--primary);
      background: var(--surface);
    }
    :host([invalid]) .control {
      border-color: var(--danger);
    }
    .control:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    input.control {
      height: 40px;
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-body);
    }
    /* textarea — 고정 높이 대신 세로 확장 */
    textarea.control {
      height: auto;
      padding: var(--space-2);
      font-size: var(--text-body);
      line-height: var(--line-height);
      resize: vertical;
      min-height: 72px;
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
            class="control"
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