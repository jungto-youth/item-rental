import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, ApiError } from "../../../api/client";
import { type Item } from "../../../types";
import { type SessionUser } from "../../../context/session";
import { navigate } from "../../../router";
import { numberInputCss } from "../../../styles/controls";
import "../../ui/button";
import "../../ui/input";
import "../../ui/notice";

@customElement("item-rental-form")
export class ItemRentalForm extends LitElement {
  @property({ type: Object }) item!: Item;
  @property({ type: Object }) user: SessionUser | null = null;
  @property({ type: Boolean }) userReady = false;

  @state() private qty = 1;
  @state() private memo = "";
  @state() private saving = false;
  @state() private message = "";
  @state() private isSuccess = false;

  static styles = [
    numberInputCss,
    css`
    :host {
      display: block;
    }

    .box {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      padding: 20px;
      background: var(--color-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-sizing: border-box;
    }

    .title {
      font-size: var(--text-heading, 17px);
      font-weight: 600;
      margin: 0;
      color: var(--color-text);
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .label {
      font-size: var(--text-body, 15px);
      color: var(--color-text);
      font-weight: 500;
    }

    .stepper {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-bg);
      overflow: hidden;
    }

    .step-btn {
      width: 38px;
      height: 38px;
      border: none;
      background: transparent;
      color: var(--color-text);
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.12s;
    }

    .step-btn:hover:not(:disabled) {
      background: var(--color-surface);
    }

    .step-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .qty-input {
      width: 52px;
      border: none;
      text-align: center;
      font-weight: 600;
      font-size: var(--text-body, 15px);
      background: transparent;
      color: var(--color-text);
      font-family: inherit;
      /* 스피너 숨김은 tokens.css 전역 규칙이 담당 */
    }

    .qty-single {
      font-size: var(--text-body, 15px);
      font-weight: 600;
      color: var(--color-text);
      padding: 6px 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-bg);
    }

    .success-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 6px;
    }

    .msg {
      font-size: var(--text-caption, 13px);
      margin: 0;
      line-height: 1.4;
    }

    .msg.error {
      color: var(--color-danger);
    }

    .msg.success {
      color: var(--color-success);
    }

    /* 메모는 항상 노출 — 접이식은 손이 많이 감 */
    .memo-title {
      font-size: var(--text-caption, 13px);
      color: var(--color-muted);
      font-weight: 500;
    }

    .memo-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
  ];

  private get rentableQty(): number {
    if (!this.item) return 0;
    return this.item.rentable_qty ?? (this.item.total_qty - (this.item.qty_broken ?? 0));
  }

  private get availableNow(): number {
    return Math.max(0, this.rentableQty - (this.item?.active_now ?? 0));
  }

  private handleDec() {
    if (this.qty > 1) this.qty--;
  }

  private handleInc() {
    if (this.qty < this.availableNow) this.qty++;
  }

  // 직접 입력 — 숫자만 반영 (빈 값은 유지), blur 시 1~최대 범위로 맞춤
  private handleQtyInput(e: Event) {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    if (Number.isFinite(v)) this.qty = v;
  }

  private handleQtyBlur(e: Event) {
    const el = e.target as HTMLInputElement;
    const v = parseInt(el.value, 10);
    const clamped = Number.isFinite(v) ? Math.min(Math.max(v, 1), this.availableNow) : 1;
    this.qty = clamped;
    el.value = String(clamped);
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (this.saving || !this.item) return;

    if (this.qty > this.availableNow) {
      this.message = `현재 최대 ${this.availableNow}개까지 대여할 수 있어요`;
      this.isSuccess = false;
      return;
    }

    this.saving = true;
    this.message = "";

    try {
      await api("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          item_id: this.item.id,
          qty: this.qty,
          memo: this.memo.trim() || undefined,
        }),
      });

      this.isSuccess = true;
      this.message = "대여가 완료되었습니다!";
      this.memo = "";
      this.qty = 1;

      this.dispatchEvent(new CustomEvent("rented", { bubbles: true, composed: true }));
    } catch (err) {
      this.isSuccess = false;
      // 기계용 code로 분기한다 — 메시지 문자열 파싱은 포맷이 바뀌면 깨진다 (client.ts 규약)
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "no_availability") {
        this.message = "방금 대여가 마감되었어요. 반납 후 다시 시도해주세요.";
      } else if (code === "too_many") {
        this.message = "요청 수량이 대여 가능 수량보다 많습니다.";
      } else if (code === "phone_required") {
        this.message = "내 정보에서 연락처를 먼저 등록해주세요.";
      } else {
        this.message = err instanceof Error ? err.message : "대여 신청에 실패했습니다.";
      }
    } finally {
      this.saving = false;
    }
  }

  render() {
    if (!this.item) return html``;

    if (this.isSuccess) {
      return html`
        <div class="box">
          <h3 class="title" style="color: var(--color-success)">🎉 대여 완료</h3>
          <p class="msg">
            <b>${this.item.name}</b> 대여가 접수되었어요. 사용 후 대여 내역에서 반납해 주세요.
          </p>
          <div class="success-actions">
            <x-button variant="primary" size="md" @click=${() => navigate("/my/rentals")}>
              대여 내역 확인 / 반납하기
            </x-button>
            <x-button variant="secondary" size="md" @click=${() => navigate("/")}>
              다른 물품 둘러보기
            </x-button>
          </div>
        </div>
      `;
    }

    const max = this.availableNow;

    // 대여 불가 상태 — 각각 한 줄 안내로만 (박스 대신)
    if (this.item.kind === "consumable") {
      return html`
        <x-notice>소모품이에요 — 별도 대여 신청 없이 관리자에게 문의해 주세요.</x-notice>
      `;
    }

    if (!this.userReady) {
      return html`
        <x-notice>사용자 확인 중…</x-notice>
      `;
    }

    if (!this.user) {
      return html`
        <x-notice
          >대여하려면 로그인이 필요해요.
          <x-button
            slot="action"
            variant="secondary"
            size="sm"
            @click=${() => navigate("/login")}
          >
            로그인
          </x-button>
        </x-notice>
      `;
    }

    if (this.item.status !== "active") {
      return html`
        <x-notice tone="warning">현재 점검 또는 수리 중인 물품이에요.</x-notice>
      `;
    }

    if (max === 0) {
      return html`
        <x-notice tone="warning">지금은 재고가 없어요 — 반납 후 다시 시도해 주세요.</x-notice>
      `;
    }

    return html`
      <form class="box" @submit=${this.handleSubmit}>
        <h3 class="title">대여 신청</h3>

        <div class="row">
          <span class="label">대여 수량</span>
          ${max > 1
        ? html`
                <div class="stepper">
                  <button
                    type="button"
                    class="step-btn"
                    @click=${this.handleDec}
                    ?disabled=${this.qty <= 1}
                    aria-label="수량 감소"
                  >
                    −
                  </button>
                  <input
                    class="qty-input"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    .max=${this.availableNow}
                    .value=${this.qty}
                    @input=${this.handleQtyInput}
                    @blur=${this.handleQtyBlur}
                    aria-label="대여 수량 직접 입력"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click=${this.handleInc}
                    ?disabled=${this.qty >= max}
                    aria-label="수량 증가"
                  >
                    +
                  </button>
                </div>
              `
        : html`<span class="qty-single">1개</span>`}
        </div>

        <div class="memo-field">
          <span class="memo-title">메모 (선택)</span>
          <x-input
            placeholder="용도, 수령처 등"
            .value=${this.memo}
            @input=${(e: Event) => (this.memo = (e.target as HTMLInputElement).value)}
          ></x-input>
        </div>

        ${this.message
        ? html`<p class="msg ${this.isSuccess ? "success" : "error"}" aria-live="polite">${this.message}</p>`
        : ""}

        <x-button variant="primary" size="md" type="submit" ?loading=${this.saving}>
          대여하기
        </x-button>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "item-rental-form": ItemRentalForm;
  }
}
