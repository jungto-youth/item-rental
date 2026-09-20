import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// 태그(카테고리) 입력 칩 에디터 — 값은 이름 문자열 배열로 주고받는다.
// 칩 [✕]으로 제거, 엔터·콤마 또는 포커스아웃으로 확정, 백스페이스는 마지막 칩 제거.
// 서버 id 로의 변환은 저장 시점에 resolveCategoryIds(utils/category)가 일괄 처리한다.
// 사전 목록(datalist)은 options 로 받고, 포함된 이름은 후보에서 제외한다.
@customElement("category-tags-input")
export class CategoryTagsInput extends LitElement {
  // 선택된 태그 이름들 — 값 변경 시마다 change 이벤트로 새 배열을 올린다
  @property({ attribute: false }) value: string[] = [];
  // 전체 카테고리 이름 후보 (자동완성용)
  @property({ attribute: false }) options: string[] = [];
  @property() placeholder = "태그 추가";

  @state() private draft = "";

  // datalist id 는 페이지에 여러 개(등록/수정 다이얼로그)가 떠도 겹치지 않게 인스턴스 고유로
  private static seq = 0;
  private listId = `catopts-${CategoryTagsInput.seq++}`;

  static styles = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      min-height: 40px;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }
    :host(:focus-within) {
      border-color: var(--color-primary);
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      padding: 2px 4px 2px 10px;
      font-size: var(--text-caption, 13px);
      line-height: 1.4;
      color: var(--color-text);
    }
    .tag button {
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      color: var(--color-muted);
      padding: 0 3px;
    }
    .tag button:hover {
      color: var(--color-danger);
    }
    input {
      flex: 1;
      min-width: 90px;
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: var(--text-body, 15px);
      color: var(--color-text);
    }
    input::placeholder {
      color: var(--color-muted);
    }
  `;

  private emit() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private commit() {
    const t = this.draft.trim();
    if (!t) return;
    if (!this.value.includes(t)) this.value = [...this.value, t];
    this.draft = "";
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      this.commit();
    } else if (
      e.key === "Backspace" &&
      this.draft === "" &&
      this.value.length > 0
    ) {
      this.removeTag(this.value.length - 1);
    }
  }

  private removeTag(i: number) {
    const v = [...this.value];
    v.splice(i, 1);
    this.value = v;
  }

  render() {
    return html`
      ${this.value.map(
        (name, i) => html`
          <span class="tag">
            ${name}
            <button
              type="button"
              aria-label="${name} 태그 제거"
              @click=${() => this.removeTag(i)}
            >
              ✕
            </button>
          </span>
        `,
      )}
      <input
        list=${this.listId}
        placeholder=${this.value.length === 0 ? this.placeholder : ""}
        .value=${this.draft}
        @input=${(e: InputEvent) => (this.draft = (e.target as HTMLInputElement).value)}
        @keydown=${this.onKey}
        @blur=${this.commit}
      />
      <datalist id=${this.listId}>
        ${this.options
          .filter((n) => !this.value.includes(n))
          .map((n) => html`<option value=${n}></option>`)}
      </datalist>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "category-tags-input": CategoryTagsInput;
  }
}