import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import { type Item } from "../../../types";
import { type SessionUser } from "../../../context/session";
import { navigate } from "../../../router";
import "../../ui/button";

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

  static styles = css`
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

    .qty-display {
      min-width: 44px;
      text-align: center;
      font-weight: 600;
      font-size: var(--text-body, 15px);
    }

    .memo-input {
      width: 100%;
      height: 42px;
      padding: 0 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-bg);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--text-body, 15px);
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }

    .memo-input:focus {
      outline: none;
      border-color: var(--color-primary);
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

    .login-prompt {
      font-size: var(--text-caption, 13px);
      color: var(--color-muted);
      text-align: center;
      padding: 8px 0;
    }
  `;

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

      // 1초 후 마이페이지로 자연스럽게 안내
      setTimeout(() => {
        navigate("/mypage");
      }, 1000);
    } catch (err) {
      this.isSuccess = false;
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("no_availability")) {
        this.message = "방금 대여가 마감되었어요. 반납 후 다시 시도해주세요.";
      } else if (msg.includes("too_many")) {
        this.message = "요청 수량이 대여 가능 수량보다 많습니다.";
      } else if (msg.includes("phone_required")) {
        this.message = "마이페이지에서 연락처를 먼저 등록해주세요.";
      } else {
        this.message = err instanceof Error ? err.message : "대여 신청에 실패했습니다.";
      }
    } finally {
      this.saving = false;
    }
  }

  render() {
    if (!this.item) return html``;

    if (this.item.kind === "consumable") {
      return html`
        <div class="box">
          <h3 class="title">소모품 안내</h3>
          <p class="msg">소모품은 별도 대여 신청 없이 관리자 문의 후 사용해 주세요.</p>
        </div>
      `;
    }

    if (!this.userReady) {
      return html`<div class="box"><p class="login-prompt">사용자 확인 중…</p></div>`;
    }

    if (!this.user) {
      return html`
        <div class="box">
          <h3 class="title">대여 신청</h3>
          <p class="login-prompt">대여를 신청하려면 먼저 로그인해 주세요.</p>
          <x-button variant="primary" size="md" @click=${() => navigate("/login")}>
            로그인하기
          </x-button>
        </div>
      `;
    }

    if (this.user.status === "pending") {
      return html`
        <div class="box">
          <h3 class="title">대여 신청</h3>
          <p class="msg error">관리자 승인 대기 중인 계정입니다. 승인 후 대여가 가능해요.</p>
        </div>
      `;
    }

    if (this.item.status !== "active") {
      return html`
        <div class="box">
          <h3 class="title">대여 불가</h3>
          <p class="msg">현재 점검 또는 수리 중인 물품입니다.</p>
        </div>
      `;
    }

    const max = this.availableNow;
    const isOutOfStock = max === 0;

    return html`
      <form class="box" @submit=${this.handleSubmit}>
        <h3 class="title">대여 신청</h3>

        <div class="row">
          <span class="label">대여 수량</span>
          <div class="stepper">
            <button
              type="button"
              class="step-btn"
              @click=${this.handleDec}
              ?disabled=${this.qty <= 1 || isOutOfStock}
              aria-label="수량 감소"
            >
              −
            </button>
            <span class="qty-display">${isOutOfStock ? 0 : this.qty}</span>
            <button
              type="button"
              class="step-btn"
              @click=${this.handleInc}
              ?disabled=${this.qty >= max || isOutOfStock}
              aria-label="수량 증가"
            >
              +
            </button>
          </div>
        </div>

        <input
          class="memo-input"
          placeholder="메모 (용도, 수령처 등 선택 입력)"
          .value=${this.memo}
          @input=${(e: Event) => (this.memo = (e.target as HTMLInputElement).value)}
          ?disabled=${isOutOfStock}
        />

        ${this.message
          ? html`<p class="msg ${this.isSuccess ? "success" : "error"}">${this.message}</p>`
          : ""}

        <x-button
          variant="primary"
          size="md"
          type="submit"
          ?loading=${this.saving}
          ?disabled=${isOutOfStock || this.saving}
        >
          ${isOutOfStock ? "현재 대여 불가 (재고 없음)" : "대여하기"}
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
