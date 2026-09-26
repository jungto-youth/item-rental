import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

export type ChipFilterOption = { value: string; label: string; count?: number };

// 필터 칩 행 — home(전체/대여 가능만)과 물품 현황(상태 그룹)의 인라인 칩을
// 컴포넌트로 뽑아낸 단일 선택 컨트롤. x-select와 API(value/options/change)가
// 거의 대칭이지만 제어 컴포넌트라 value 는 부모가 소유한다 (아래 select 주석).
// 칩은 한 줄에 좌→우로 나열되고 넘치면 가로 스크롤 — 카테고리처럼 옵션 수가
// 동적인 필터도 줄바꿈 없이 같은 높이를 유지한다.
@customElement("x-chip-filter")
export class XChipFilter extends LitElement {
    @property() value = "";
    @property() options: ChipFilterOption[] = [];
    // 접근성 — 섀도 경계로 <label for>가 못 넘어가므로 group에 aria-label로 주입
    @property() ariaLabel = "";
    // sm(32px)은 콘텐츠 영역 기본, md(40px)는 툴바에서 검색 인풋과 높이를 맞출 때,
    // lg(44px)는 폼 다이얼로그의 x-input 등 44px 컨트롤과 나란히 둘 때
    @property({ reflect: true }) size: "sm" | "md" | "lg" = "sm";
    @property({ type: Boolean, reflect: true }) disabled = false;

    // 제어 컴포넌트 — 클릭해도 자체 value 를 바꾸지 않고 change 이벤트만 발행한다.
    // 상태 소유는 부모: 부모가 바꿔줘야 칩이 움직인다. 확인 다이얼로그에서 취소하면
    // 부모가 상태를 안 바꾸므로 칩이 제자리에 머무는 식으로 원복이 공짜다.
    // 같은 값 재선택은 이벤트 없이 무시.
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

    static styles = css`
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
    .chip {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 32px;
      padding: 0 12px;
      border-radius: var(--radius-pill, 8px);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-muted);
      font-size: var(--text-caption, 13px);
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .chip:hover {
      border-color: var(--color-muted);
      color: var(--color-text);
    }
    .chip:focus-visible {
      outline: 2px solid var(--color-primary-focus);
      outline-offset: 1px;
    }
    .chip.active {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-primary-text);
    }
    .chip:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .count {
      font-size: var(--text-fine, 12px);
      opacity: 0.85;
    }
    .size-md .chip {
      height: 40px;
      padding: 0 14px;
      font-size: var(--text-body, 15px);
    }
    .size-lg .chip {
      height: 44px;
      padding: 0 14px;
      font-size: var(--text-body, 15px);
    }
  `;

    render() {
        return html`
      <div class="row" role="group" aria-label=${this.ariaLabel || undefined}>
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
        "x-chip-filter": XChipFilter;
    }
}
