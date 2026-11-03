import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { base } from "../../styles/base";
import { sheet } from "../../styles/sheet";
import chipStyles from "./chip.css?inline";

export type ChipOption = { value: string; label: string };

// 단일 선택 칩 행 — 필터·탭·상태 선택의 유일한 칩 컨트롤.
// 제어 컴포넌트라 클릭해도 자체 value를 바꾸지 않고 change 이벤트만 발행한다.
// 시안처럼 칩은 내용 폭만큼 나열되고, 폭이 모자라면 다음 줄로 넘긴다.
@customElement("x-chip")
export class XChip extends LitElement {
  @property() value = "";
  @property() options: ChipOption[] = [];
  // 접근성 — 섀도 경계로 <label for>가 못 넘어가므로 group에 aria-label로 주입
  @property() ariaLabel = "";
  // lg(44px)는 폼의 x-input 등 44px 컨트롤과 나란히 둘 때
  @property({ reflect: true }) size: "sm" | "lg" = "sm";
  @property({ type: Boolean, reflect: true }) disabled = false;

  // 같은 값 재선택은 이벤트 없이 무시. 확인 다이얼로그에서 취소하면
  // 부모가 상태를 안 바꾸므로 칩이 제자리에 머무는 식으로 원복이 공짜다.
  private select(v: string) {
    if (this.disabled) return;
    if (v === this.value) return;
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: v },
        bubbles: true,
        composed: true,
      }),
    );
  }

  static styles = [base, sheet(chipStyles)];

  render() {
    return html`
      <div class="row size-${this.size}" role="group" aria-label=${this.ariaLabel || undefined}>
        ${this.options.map(
          (o) => html`
            <button
              type="button"
              class="chip ${o.value === this.value ? "active" : ""}"
              aria-pressed=${o.value === this.value}
              ?disabled=${this.disabled}
              @click=${() => this.select(o.value)}
            >
              ${o.label}
            </button>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-chip": XChip;
  }
}
