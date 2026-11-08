import { Show, createSignal } from "solid-js";
import { api, ApiError } from "../../../api/client";
import type { SessionUser } from "../../../context/session";
import type { Item } from "../../../types";
import { availableQty, maxRequestQty } from "../../../utils/stock";
import {
  defaultDueDateKst,
  isDueDateInRange,
  maxDueDateKst,
  minDueDateKst,
} from "../../../../../shared/rental-period";
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
  const [dueDate, setDueDate] = createSignal(defaultDueDateKst());
  const [submittedDueDate, setSubmittedDueDate] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [isSuccess, setIsSuccess] = createSignal(false);
  const [result, setResult] = createSignal<{ now: number; wait: number } | null>(
    null,
  );

  const availableNow = () => availableQty(props.item);
  const maxRequest = () => maxRequestQty(props.item);
  // 한 신청 안에서 지금 배정되는 몫과 반납을 기다리는 몫
  const nowQty = () => Math.min(qty(), availableNow());
  const waitQty = () => Math.max(0, qty() - availableNow());
  const needsDueDate = () => nowQty() > 0;

  const handleQtyBlur = (event: FocusEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = parseInt(input.value, 10);
    const clamped = Number.isFinite(value)
      ? Math.min(Math.max(value, 1), Math.max(1, maxRequest()))
      : 1;
    setQty(clamped);
    input.value = String(clamped);
  };

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving() || !props.item) return;

    if (qty() > maxRequest()) {
      setMessage(`지금은 최대 ${maxRequest()}개까지 신청할 수 있습니다`);
      setIsSuccess(false);
      return;
    }

    if (!memo().trim()) {
      setMessage("메모를 입력해 주세요.");
      setIsSuccess(false);
      return;
    }

    // 예약만 하는 신청은 반납일이 없다 — 승인 시 관리자가 정한다.
    if (needsDueDate() && !isDueDateInRange(dueDate())) {
      setMessage("반납 예정일을 내일부터 30일 이내로 선택해 주세요.");
      setIsSuccess(false);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const res = await api<{
        group_id: string;
        segments: { id: number; status: "pending" | "reserved"; qty: number }[];
      }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          item_id: props.item.id,
          qty: qty(),
          memo: memo().trim(),
          due_date: dueDate(),
        }),
      });
      const now = res.segments
        .filter((segment) => segment.status === "pending")
        .reduce((sum, segment) => sum + segment.qty, 0);
      const wait = res.segments
        .filter((segment) => segment.status === "reserved")
        .reduce((sum, segment) => sum + segment.qty, 0);
      setResult({ now, wait });
      setSubmittedDueDate(dueDate());
      setIsSuccess(true);
      setMessage("");
      setMemo("");
      setQty(1);
      props.onRented?.();
    } catch (err) {
      setIsSuccess(false);
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "queue_full") {
        setMessage(
          `대기열이 가득 찼습니다. 지금은 최대 ${maxRequest()}개까지 신청할 수 있습니다.`,
        );
      } else if (code === "no_availability") {
        setMessage("방금 신청이 마감되었습니다. 반납 후 다시 시도해 주세요.");
      } else if (code === "too_many") {
        setMessage("요청 수량이 보유 수량보다 많습니다.");
      } else if (code === "phone_required") {
        setMessage("내 정보에서 연락처를 먼저 등록해 주세요.");
      } else if (code === "affiliation_required") {
        setMessage("내 정보에서 지부·지회·모둠을 먼저 등록해 주세요.");
      } else if (code === "memo_required") {
        setMessage("메모를 입력해 주세요.");
      } else if (code === "bad_due_date" || code === "due_date_out_of_range") {
        setMessage("반납 예정일을 내일부터 30일 이내로 선택해 주세요.");
      } else {
        setMessage(err instanceof Error ? err.message : "신청에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="item-rental-form block">
      <Show
        when={!isSuccess()}
        fallback={
          <div class="flex flex-col items-center rounded-card border border-line bg-surface p-6 text-center">
            <span
              class="flex size-12 items-center justify-center rounded-pill bg-primary-soft text-primary-strong [&_svg]:size-6"
              aria-hidden="true"
            >
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
            <p class="mt-4 text-body font-semibold leading-normal text-ink-1">
              {result()?.now && result()?.wait
                ? "대여 신청과 예약을 접수했습니다"
                : result()?.wait
                  ? "예약을 접수했습니다"
                  : "대여를 신청했습니다"}
            </p>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              '{props.item.name}'{" "}
              {[
                result()?.now ? `지금 대여 ${result()!.now}개` : "",
                result()?.wait ? `반납 대기 예약 ${result()!.wait}개` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              를 접수했습니다.
              <br />
              {result()?.wait
                ? "예약분은 반납 순서대로 승인되며, 반납 예정일은 승인할 때 정해집니다."
                : "관리자가 승인하면 대여가 시작됩니다."}
              {result()?.now ? ` 희망 반납일은 ${submittedDueDate()}입니다.` : ""}
              <br />
              진행 상황은 대여 내역에서 확인해 주세요.
            </p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => navigate("/my/rentals")}>
                대여 내역
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
                  대여하려면 로그인이 필요합니다.
                </Notice>
              }
            >
              <Show
                when={props.item.lifecycle === "active"}
                fallback={
                  <Notice tone="danger">더 이상 대여하지 않는 물품입니다.</Notice>
                }
              >
                <Show
                  when={maxRequest() > 0}
                  fallback={
                    <Notice tone="danger">
                      지금은 대여도 예약도 마감되었습니다 — 반납 후 다시 확인해 주세요.
                    </Notice>
                  }
                >
                  <form
                    class="box-border flex flex-col rounded-card border border-line bg-surface p-6 max-sm:p-4"
                    onSubmit={handleSubmit}
                  >
                    <h3 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">
                      {availableNow() > 0 ? "대여 신청" : "예약 신청"}
                    </h3>

                    <Show when={availableNow() === 0}>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        지금은 대여 가능한 재고가 없어 예약으로 접수됩니다.
                        관리자가 반납 순서대로 승인합니다.
                      </p>
                    </Show>

                    <div class="mt-6 flex items-center justify-between gap-4">
                      <span class="text-fine font-medium text-ink-2">
                        신청 수량
                      </span>
                      <Show
                        when={maxRequest() > 1}
                        fallback={
                          <span class="inline-flex h-10 items-center rounded-card border border-line bg-surface px-4 text-body font-semibold text-ink-1">
                            1개
                          </span>
                        }
                      >
                        <div class="inline-flex h-10 items-center overflow-hidden rounded-card border border-line bg-surface">
                          <button
                            type="button"
                            class="flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-lg leading-[1.2] text-ink-2 enabled:hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setQty((value) => Math.max(1, value - 1))}
                            disabled={qty() <= 1}
                            aria-label="수량 감소"
                          >
                            −
                          </button>
                          <input
                            class="h-10 w-12 border-x border-line bg-transparent text-center text-body font-semibold text-ink-1 focus:border-primary focus:outline-none"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            max={maxRequest()}
                            value={qty()}
                            onInput={(event) => {
                              const value = parseInt(event.currentTarget.value, 10);
                              if (Number.isFinite(value)) setQty(value);
                            }}
                            onBlur={handleQtyBlur}
                            aria-label="신청 수량 직접 입력"
                          />
                          <button
                            type="button"
                            class="flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-lg leading-[1.2] text-ink-2 enabled:hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() =>
                              setQty((value) => Math.min(maxRequest(), value + 1))
                            }
                            disabled={qty() >= maxRequest()}
                            aria-label="수량 증가"
                          >
                            +
                          </button>
                        </div>
                      </Show>
                    </div>

                    <div class="mt-4 grid gap-1 rounded-card bg-surface-muted px-4 py-3 text-fine leading-normal text-ink-2">
                      <span>
                        지금 대여 신청{" "}
                        <b class="font-semibold text-ink-1">{nowQty()}개</b>
                      </span>
                      <Show when={waitQty() > 0}>
                        <span>
                          반납 대기 예약{" "}
                          <b class="font-semibold text-ink-1">{waitQty()}개</b>
                        </span>
                      </Show>
                    </div>

                    <Show when={needsDueDate()}>
                      <Input
                        class="mt-4"
                        label="반납 예정일 *"
                        type="date"
                        min={minDueDateKst()}
                        max={maxDueDateKst()}
                        value={dueDate()}
                        onInput={setDueDate}
                        required
                      />
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        내일부터 30일 이내로 선택해 주세요.
                      </p>
                    </Show>
                    <Show when={waitQty() > 0}>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        예약분의 반납 예정일은 관리자가 승인할 때 정합니다.
                      </p>
                    </Show>

                    <Input
                      class="mt-4"
                      label="메모 *"
                      placeholder="용도, 수령처 등"
                      value={memo()}
                      onInput={setMemo}
                      required
                    />

                    <Show when={message()}>
                      <p
                        class="mt-2 text-fine leading-normal text-danger"
                        aria-live="polite"
                      >
                        {message()}
                      </p>
                    </Show>

                    <Button
                      class="mt-6 w-full"
                      variant="primary"
                      type="submit"
                      loading={saving()}
                    >
                      {nowQty() > 0 && waitQty() > 0
                        ? "대여 신청 + 예약"
                        : waitQty() > 0
                          ? "예약하기"
                          : "대여하기"}
                    </Button>
                    <p class="mt-2 text-fine leading-normal text-ink-2">
                      {waitQty() > 0
                        ? "예약분은 반납 순서대로 승인됩니다. 반납 예정일은 승인할 때 정해집니다."
                        : "신청 후 관리자가 승인하면 대여가 시작됩니다."}
                    </p>
                  </form>
                </Show>
              </Show>
            </Show>
          </Show>
          <Show when={props.item.kind === "consumable"}>
            <Notice>
              소모품입니다 — 별도 대여 신청 없이 관리자에게 문의해 주세요.
            </Notice>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
