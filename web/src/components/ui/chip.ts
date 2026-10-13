import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { chipCss } from "../../styles/ui";

export type ChipOption = { value: string; label: string; count?: number };

// 단일 선택 칩 행 — 필터·탭·상태 선택의 유일한 칩 컨트롤.
// 제어 컴포넌트라 클릭해도 자체 value를 바꾸지 않고 change 이벤트만 발행한다.
// 칩은 한 줄에 좌→우로 나열되고 넘치면 가로 스크롤 — 옵션 수가 동적이어도
// 줄바꿈 없이 같은 높이를 유지한다.
@customElement("x-chip")
export class XChip extends LitElement {
  @property() value = "";
  @property() options: ChipOption[] = [];
  // 접근성 — 섀도 경계로 <label for>가 못 넘어가므로 group에 aria-label로 주입
  @property() ariaLabel = "";
  // sm(32px)은 콘텐츠 영역 기본, lg(44px)는 폼의 x-input 등 44px 컨트롤과 나란히 둘 때
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

  static styles = [
    chipCss,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-wrap: nowrap;
        overflow-x: auto;
        /* 칩이 넘치는 화면에서 스크롤바 대신 스크롤 동작만 — 행 높이 일관 유지 */
        scrollbar-width: none;
      }
      .row::-webkit-scrollbar {
        display: none;
      }
      .size-lg .chip {
        height: 44px;
        padding: 0 var(--space-3-5, 14px);
        font-size: var(--text-body, 15px);
      }
    `,
  ];

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
              ${o.label} ${o.count != null ? html`<span class="count">${o.count}</span>` : ""}
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
