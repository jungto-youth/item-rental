import { Show, createSignal } from "solid-js";
import { api, ApiError } from "../../../api/client";
import type { SessionUser } from "../../../context/session";
import type { Item } from "../../../types";
import { availableQty } from "../../../utils/stock";
import { navigate } from "../../../router";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Notice } from "../../ui/notice";

export function ItemRentalForm(props: {
  item: Item;
  user: SessionUser | null;
  userReady: boolean;
  onRented?: () => void;
}) {
  const [qty, setQty] = createSignal(1);
  const [memo, setMemo] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [isSuccess, setIsSuccess] = createSignal(false);
  const [rentedQty, setRentedQty] = createSignal(0);

  const availableNow = () => availableQty(props.item);

  const handleQtyBlur = (event: FocusEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = parseInt(input.value, 10);
    const clamped = Number.isFinite(value)
      ? Math.min(Math.max(value, 1), availableNow())
      : 1;
    setQty(clamped);
    input.value = String(clamped);
  };

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving() || !props.item) return;

    if (qty() > availableNow()) {
      setMessage(`현재 최대 ${availableNow()}개까지 대여할 수 있어요`);
      setIsSuccess(false);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await api("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          item_id: props.item.id,
          qty: qty(),
          memo: memo().trim() || undefined,
        }),
      });
      setIsSuccess(true);
      setRentedQty(qty());
      setMessage("");
      setMemo("");
      setQty(1);
      props.onRented?.();
    } catch (err) {
      setIsSuccess(false);
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "no_availability") {
        setMessage("방금 대여가 마감되었어요. 반납 후 다시 시도해주세요.");
      } else if (code === "too_many") {
        setMessage("요청 수량이 대여 가능 수량보다 많아요.");
      } else if (code === "phone_required") {
        setMessage("내 정보에서 연락처를 먼저 등록해주세요.");
      } else {
        setMessage(err instanceof Error ? err.message : "대여 신청에 실패했어요.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="item-rental-form">
      <Show
        when={!isSuccess()}
        fallback={
          <div class="box success">
            <span class="success-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <p class="success-title">대여했어요</p>
            <p class="success-desc">
              '{props.item.name}' {rentedQty()}개를 대여 중이에요.
              <br />
              반납은 대여 기록에서 할 수 있어요.
            </p>
            <div class="success-actions">
              <Button variant="primary" onClick={() => navigate("/my/rentals")}>
                대여 기록
              </Button>
              <Button variant="secondary" onClick={() => navigate("/")}>
                계속 둘러보기
              </Button>
            </div>
          </div>
        }
      >
        <Show when={props.item.kind !== "consumable"}>
          <Show
            when={props.userReady}
            fallback={<Notice>사용자 확인 중…</Notice>}
          >
            <Show
              when={props.user}
              fallback={
                <Notice
                  action={
                    <Button variant="secondary" onClick={() => navigate("/login")}>
                      로그인
                    </Button>
                  }
                >
                  대여하려면 로그인이 필요해요.
                </Notice>
              }
            >
              <Show
                when={props.item.lifecycle === "active"}
                fallback={
                  <Notice tone="danger">더 이상 대여하지 않는 물품이에요.</Notice>
                }
              >
                <Show
                  when={availableNow() > 0}
                  fallback={
                    <Notice tone="danger">
                      지금은 재고가 없어요 — 반납 후 다시 시도해 주세요.
                    </Notice>
                  }
                >
                  <form class="box" onSubmit={handleSubmit}>
                    <div class="form-head">
                      <h3 class="title">대여 신청</h3>
                      <span class="avail">
                        대여 가능 <b>{availableNow()}개</b>
                      </span>
                    </div>

                    <div class="divider" aria-hidden="true" />

                    <div class="row">
                      <span class="label">대여 수량</span>
                      <Show
                        when={availableNow() > 1}
                        fallback={<span class="qty-single">1개</span>}
                      >
                        <div class="stepper">
                          <button
                            type="button"
                            class="step-btn"
                            onClick={() => setQty((value) => Math.max(1, value - 1))}
                            disabled={qty() <= 1}
                            aria-label="수량 감소"
                          >
                            −
                          </button>
                          <input
                            class="qty-input"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            max={availableNow()}
                            value={qty()}
                            onInput={(event) => {
                              const value = parseInt(event.currentTarget.value, 10);
                              if (Number.isFinite(value)) setQty(value);
                            }}
                            onBlur={handleQtyBlur}
                            aria-label="대여 수량 직접 입력"
                          />
                          <button
                            type="button"
                            class="step-btn"
                            onClick={() =>
                              setQty((value) => Math.min(availableNow(), value + 1))
                            }
                            disabled={qty() >= availableNow()}
                            aria-label="수량 증가"
                          >
                            +
                          </button>
                        </div>
                      </Show>
                    </div>

                    <label class="memo-field">
                      <span class="memo-title">메모 (선택)</span>
                      <Input
                        placeholder="용도, 수령처 등"
                        value={memo()}
                        onInput={setMemo}
                      />
                    </label>

                    <Show when={message()}>
                      <p class="msg error" aria-live="polite">
                        {message()}
                      </p>
                    </Show>

                    <Button variant="primary" type="submit" loading={saving()}>
                      대여하기
                    </Button>
                    <p class="note">
                      신청하면 바로 대여 중이 돼요. 반납은 대여 기록에서 할 수 있어요.
                    </p>
                  </form>
                </Show>
              </Show>
            </Show>
          </Show>
          <Show when={props.item.kind === "consumable"}>
            <Notice>
              소모품이에요 — 별도 대여 신청 없이 관리자에게 문의해 주세요.
            </Notice>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
