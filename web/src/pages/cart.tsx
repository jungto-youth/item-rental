import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from "solid-js";
import { api, ApiError } from "../api/client";
import { cart, type CartLine } from "../context/cart";
import { session } from "../context/session";
import { navigate } from "../router";
import type { CartReservationResult, Item } from "../types";
import { availableQty, maxRequestQty } from "../utils/stock";
import { MAX_CART_LINES } from "../../../shared/cart";
import {
  defaultDueDateKst,
  isDueDateInRange,
} from "../../../shared/rental-period";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { Input } from "../components/ui/input";
import { Notice } from "../components/ui/notice";
import { PageHeader } from "../components/ui/page-header";
import { QuantityStepper } from "../components/ui/quantity-stepper";
import { Skeleton } from "../components/ui/skeleton";
import { ImageIcon } from "../components/icons";
import { RentalPeriodPicker } from "../components/features/rental/rental-period-picker";
import { confirmDialog } from "../utils/confirm";

type Failure = { itemId: number; name: string; reason: string };

type SubmitSummary = {
  ok: number;
  now: number;
  wait: number;
  failures: Failure[];
};

// 화면이 항목별 실패를 같은 문구로 읽게 한다 — 단건 대여 폼과 같은 규칙.
function failureText(
  result: Extract<CartReservationResult, { ok: false }>,
): string {
  switch (result.error) {
    case "queue_full":
      return result.max_request === undefined || result.max_request <= 0
        ? "대기열이 가득 찼습니다 — 반납 후 다시 시도해 주세요."
        : `대기열이 가득 찼습니다 — 지금은 최대 ${result.max_request}개까지 신청할 수 있습니다.`;
    case "too_many":
      return "요청 수량이 보유 수량보다 많습니다.";
    case "no_availability":
      return "방금 마감되었습니다 — 반납 후 다시 시도해 주세요.";
    case "item_not_active":
      return "더 이상 대여하지 않는 물품입니다.";
    case "not_found":
      return "삭제되었거나 볼 수 없는 물품입니다.";
  }
}

function submitErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "phone_required") {
      return "내 정보에서 연락처를 먼저 등록해 주세요.";
    }
    if (error.code === "affiliation_required") {
      return "내 정보에서 지부·지회·모둠을 먼저 등록해 주세요.";
    }
    if (error.code === "duplicate_item") {
      return "같은 물품이 두 번 담겨 있습니다 — 새로고침 후 다시 시도해 주세요.";
    }
    if (error.code === "empty_cart") return "장바구니가 비어 있습니다.";
    if (error.code === "too_many_items") {
      return `한 번에 최대 ${MAX_CART_LINES}종까지 신청할 수 있습니다.`;
    }
    if (error.code === "memo_required") return "메모를 입력해 주세요.";
    if (error.code === "bad_due_date" || error.code === "due_date_out_of_range") {
      return "반납 예정일을 내일부터 30일 이내로 선택해 주세요.";
    }
  }
  return error instanceof Error ? error.message : "신청에 실패했습니다.";
}

export default function Cart() {
  const [items, setItems] = createSignal<Map<number, Item | null>>(new Map());
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal("");
  const [memo, setMemo] = createSignal("");
  const [dueDate, setDueDate] = createSignal(defaultDueDateKst());
  const [errors, setErrors] = createSignal<Map<number, string>>(new Map());
  const [submitting, setSubmitting] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [result, setResult] = createSignal<SubmitSummary | null>(null);

  let loadGen = 0;
  // 첫 목록을 그린 뒤에는 빼기·부분 성공 같은 변화에 스켈레톤을 다시 보이지 않는다.
  let renderedOnce = false;

  const load = async (quiet = false) => {
    const gen = ++loadGen;
    const target = cart.lines();
    if (target.length === 0) {
      setItems(new Map());
      setLoading(false);
      setLoadError("");
      return;
    }

    if (!quiet) setLoading(true);
    setLoadError("");
    const outcomes = await Promise.allSettled(
      target.map(async (line) => {
        const response = await api<{ item: Item }>(`/api/items/${line.itemId}`);
        return [line.itemId, response.item] as const;
      }),
    );
    if (gen !== loadGen) return;

    const next = new Map<number, Item | null>();
    let networkFailures = 0;
    outcomes.forEach((outcome, index) => {
      const line = target[index];
      if (!line) return;
      if (outcome.status === "fulfilled") {
        next.set(line.itemId, outcome.value[1]);
      } else {
        // 404 는 삭제·권한 변경이다. 그 외(네트워크·5xx)는 잠시 뒤 다시 시도할 수 있다.
        if (!(outcome.reason instanceof ApiError && outcome.reason.status === 404)) {
          networkFailures += 1;
        }
        next.set(line.itemId, null);
      }
    });

    // 현재 재고보다 많이 담겨 있으면 지금 신청 가능한 수량으로 줄인다.
    for (const line of target) {
      const item = next.get(line.itemId);
      if (!item) continue;
      const max = maxRequestQty(item);
      if (max > 0 && line.qty > max) cart.setQty(line.itemId, max);
    }

    setItems(next);
    setLoading(false);
    renderedOnce = true;
    if (networkFailures > 0 && networkFailures === target.length) {
      setLoadError("물품 정보를 불러오지 못했습니다 — 연결 상태를 확인해 주세요.");
    }
  };

  onSettled(() => {
    void session.ensure();
  });

  // 장바구니의 물품 종류가 바뀔 때만 다시 읽는다 — 수량 변경은 화면 상태만 고친다.
  // 한 번 그린 뒤에는 스켈레톤으로 되돌리지 않고 조용히 갱신한다(빼기·부분 성공).
  createEffect(
    () => cart.lines().map((line) => line.itemId).join(","),
    () => {
      void load(renderedOnce);
    },
  );

  const lineView = (line: CartLine) => {
    const item = items().get(line.itemId);
    if (!item) {
      return {
        item: null,
        max: 0,
        now: 0,
        wait: 0,
        active: false,
      };
    }
    const max = maxRequestQty(item);
    const available = availableQty(item);
    return {
      item,
      max,
      now: Math.min(line.qty, available),
      wait: Math.max(0, line.qty - available),
      active: max > 0,
    };
  };

  const validLines = createMemo(() =>
    cart.lines().filter((line) => {
      const item = items().get(line.itemId);
      return item !== undefined && item !== null && maxRequestQty(item) > 0;
    }),
  );

  // 지금 배정되는 몫이 하나라도 있어야 반납 예정일이 필요하다.
  const needsDueDate = createMemo(() =>
    validLines().some((line) => {
      const item = items().get(line.itemId);
      return item != null && availableQty(item) > 0;
    }),
  );

  const totals = createMemo(() => {
    let now = 0;
    let wait = 0;
    for (const line of validLines()) {
      const item = items().get(line.itemId);
      if (!item) continue;
      const available = availableQty(item);
      now += Math.min(line.qty, available);
      wait += Math.max(0, line.qty - available);
    }
    return { now, wait };
  });

  const allSucceeded = () => {
    const summary = result();
    return summary !== null && summary.failures.length === 0;
  };

  const clearError = (itemId: number) => {
    setErrors((previous) => {
      if (!previous.has(itemId)) return previous;
      const next = new Map(previous);
      next.delete(itemId);
      return next;
    });
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting()) return;

    setMessage("");
    setResult(null);

    const targets = validLines();
    if (targets.length === 0) {
      setMessage("신청할 수 있는 물품이 없습니다 — 품목을 확인해 주세요.");
      return;
    }
    if (!memo().trim()) {
      setMessage("메모를 입력해 주세요.");
      return;
    }
    if (needsDueDate() && !isDueDateInRange(dueDate())) {
      setMessage("반납 예정일을 내일부터 30일 이내로 선택해 주세요.");
      return;
    }

    const nameById = new Map(
      targets.map((line) => [
        line.itemId,
        items().get(line.itemId)?.name ?? `물품 #${line.itemId}`,
      ]),
    );

    setSubmitting(true);
    try {
      const response = await api<{ results: CartReservationResult[] }>(
        "/api/reservations/batch",
        {
          method: "POST",
          body: JSON.stringify({
            items: targets.map((line) => ({
              item_id: line.itemId,
              qty: line.qty,
            })),
            memo: memo().trim(),
            due_date: dueDate(),
          }),
        },
      );

      const nextErrors = new Map<number, string>();
      const failures: Failure[] = [];
      const succeeded: number[] = [];
      let ok = 0;
      let now = 0;
      let wait = 0;

      for (const entry of response.results) {
        if (entry.ok) {
          ok += 1;
          succeeded.push(entry.item_id);
          now += entry.segments
            .filter((segment) => segment.status === "pending")
            .reduce((sum, segment) => sum + segment.qty, 0);
          wait += entry.segments
            .filter((segment) => segment.status === "reserved")
            .reduce((sum, segment) => sum + segment.qty, 0);
        } else {
          const reason = failureText(entry);
          failures.push({
            itemId: entry.item_id,
            name: nameById.get(entry.item_id) ?? `물품 #${entry.item_id}`,
            reason,
          });
          nextErrors.set(entry.item_id, reason);
        }
      }

      setErrors(nextErrors);
      // 성공한 줄만 장바구니에서 뺀다 — 실패한 줄은 사유와 함께 남겨 바로 재시도한다.
      cart.removeMany(succeeded);
      setResult({ ok, now, wait, failures });

      if (failures.length === 0) {
        setMemo("");
      } else if (succeeded.length === 0) {
        // 전부 실패하면 장바구니 줄이 그대로라 위 effect 가 다시 읽지 않는다 —
        // 사유가 '방금 마감'일 수 있으므로 재고를 최신으로 맞춘다.
        void load();
      }
    } catch (error) {
      setMessage(submitErrorText(error));
    } finally {
      setSubmitting(false);
    }
  };

  const successPanel = () => {
    const summary = () => result()!;
    return (
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
          {summary().ok}종을 신청했습니다
        </p>
        <p class="mt-2 text-fine leading-normal text-ink-2">
          {[
            summary().now > 0 ? `지금 대여 ${summary().now}개` : "",
            summary().wait > 0 ? `반납 대기 예약 ${summary().wait}개` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          를 접수했습니다.
          <br />
          {summary().wait > 0
            ? "예약분은 반납 순서대로 승인되며, 반납 예정일은 승인할 때 정해집니다."
            : "관리자가 승인하면 대여가 시작됩니다."}
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
    );
  };

  const renderSkeleton = () => (
    <div class="flex flex-col gap-2" role="status" aria-label="장바구니를 불러오는 중">
      <For each={Array.from({ length: 3 })}>
        {() => (
          <div class="rounded-card border border-line bg-surface p-4" aria-hidden="true">
            <div class="flex items-start gap-3">
              <Skeleton tone="muted" class="size-16 shrink-0 rounded-card" />
              <div class="grid flex-1 gap-2">
                <Skeleton class="h-4 w-2/3 rounded" />
                <Skeleton class="h-3 w-1/3 rounded" />
                <Skeleton class="h-3 w-1/2 rounded" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );

  return (
    <div class="page-cart block">
      <PageHeader
        title="장바구니"
        subtitle="담은 물품을 한 번에 신청합니다. 담은 시점이 아니라 신청할 때 재고를 확인합니다."
      />

      <Show when={!loading() && !allSucceeded() && cart.count() === 0}>
        <Empty
          state="empty"
          text="장바구니가 비어 있습니다"
          subtitle="물품 현황에서 '담기'를 눌러 여러 물품을 한 번에 신청할 수 있습니다."
        >
          <Button variant="primary" onClick={() => navigate("/")}>
            물품 둘러보기
          </Button>
        </Empty>
      </Show>

      <Show when={allSucceeded()}>
        {successPanel()}
      </Show>

      <Show when={!allSucceeded() && cart.count() > 0}>
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div class="min-w-0">
            <Show when={loadError()}>
              <div class="mb-4 block">
                <Notice
                  tone="danger"
                  alert
                  action={
                    <Button variant="secondary" onClick={() => void load()}>
                      다시 시도
                    </Button>
                  }
                >
                  {loadError()}
                </Notice>
              </div>
            </Show>

            <Show when={result() && result()!.failures.length > 0}>
              <div class="mb-4 block">
                <Notice
                  tone={result()!.ok > 0 ? "info" : "danger"}
                  alert={result()!.ok === 0}
                >
                  {result()!.ok > 0
                    ? `${result()!.ok}종을 접수했습니다. ${result()!.failures.length}종은 접수되지 않았습니다 — 아래 사유를 확인해 주세요.`
                    : "신청하지 못했습니다 — 아래 사유를 확인해 주세요."}
                </Notice>
              </div>
            </Show>

            <Show when={loading()} fallback={
              <ul class="flex flex-col gap-2" role="list">
                <For each={cart.lines()}>
                  {(line) => {
                    const view = () => lineView(line);
                    return (
                      <li class="cart-line rounded-card border border-line bg-surface p-4">
                        <div class="flex items-start gap-3">
                          <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-muted text-ink-3">
                            <Show
                              when={view().item?.photos?.[0]?.thumb_url}
                              fallback={<ImageIcon class="size-6" />}
                            >
                              {(src) => (
                                <img
                                  class="size-full object-cover"
                                  src={src()}
                                  alt=""
                                />
                              )}
                            </Show>
                          </span>
                          <div class="min-w-0 flex-1">
                            <Show
                              when={view().item}
                              fallback={
                                <p class="m-0 text-body font-semibold tracking-tight text-ink-1">
                                  삭제되었거나 볼 수 없는 물품
                                </p>
                              }
                            >
                              {(item) => (
                                <>
                                  <a
                                    class="block text-body font-semibold tracking-tight text-ink-1 no-underline hover:text-primary-strong"
                                    href={`/items/${item().id}`}
                                  >
                                    {item().name}
                                  </a>
                                  <p class="mt-1 text-fine leading-normal text-ink-2">
                                    {item().location || "위치 미지정"}
                                  </p>
                                </>
                              )}
                            </Show>

                            <Show when={view().active}>
                              <p class="mt-1 text-fine leading-normal text-ink-2 tabular-nums">
                                <Show when={view().now > 0}>
                                  지금 대여{" "}
                                  <b class="font-semibold text-ink-1">
                                    {view().now}개
                                  </b>
                                </Show>
                                <Show when={view().now > 0 && view().wait > 0}>
                                  {" · "}
                                </Show>
                                <Show when={view().wait > 0}>
                                  예약 대기{" "}
                                  <b class="font-semibold text-ink-1">
                                    {view().wait}개
                                  </b>
                                </Show>
                              </p>
                            </Show>

                            <Show when={!view().active}>
                              <p class="mt-1 text-fine leading-normal text-danger">
                                지금은 신청할 수 없습니다 — 빼거나 나중에 다시
                                담아 주세요.
                              </p>
                            </Show>

                            <Show when={errors().get(line.itemId)}>
                              <p
                                class="mt-1 text-fine leading-normal text-danger"
                                role="status"
                              >
                                {errors().get(line.itemId)}
                              </p>
                            </Show>
                          </div>
                        </div>

                        <div class="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                          <Show
                            when={view().max > 0}
                            fallback={
                              <span class="text-fine text-ink-2">
                                {line.qty}개
                              </span>
                            }
                          >
                            <QuantityStepper
                              value={line.qty}
                              max={view().max}
                              label={view().item?.name ?? "물품"}
                              onChange={(qty) => {
                                clearError(line.itemId);
                                cart.setQty(line.itemId, qty);
                              }}
                            />
                          </Show>
                          <button
                            type="button"
                            class="cursor-pointer border-0 bg-transparent p-0 text-fine text-ink-2 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
                            onClick={() => cart.remove(line.itemId)}
                            aria-label={`${view().item?.name ?? "물품"} 장바구니에서 빼기`}
                          >
                            빼기
                          </button>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            }>
              {renderSkeleton()}
            </Show>

            <p class="mt-4 text-fine leading-normal text-ink-2">
              최대 {MAX_CART_LINES}종까지 담을 수 있습니다.
            </p>
          </div>

          <aside
            class="rounded-card border border-line bg-surface p-6 max-sm:p-4 lg:sticky lg:top-24"
            aria-label="묶음 신청"
          >
            <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">
              묶음 신청
            </h2>
            <p class="mt-2 text-fine leading-normal text-ink-2 tabular-nums">
              신청 가능 {validLines().length}종 · 지금 대여 {totals().now}개
              <Show when={totals().wait > 0}>
                {" · "}예약 대기 {totals().wait}개
              </Show>
            </p>

            <form onSubmit={submit}>
              <Show when={needsDueDate()}>
                <RentalPeriodPicker
                  class="mt-4"
                  value={dueDate()}
                  onChange={setDueDate}
                />
              </Show>

              <Show when={validLines().length > 0 && !needsDueDate()}>
                <p class="mt-4 text-fine leading-normal text-ink-2">
                  지금은 모든 물품이 예약 대기입니다 — 반납 예정일은 관리자가
                  승인할 때 정합니다.
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
                loading={submitting()}
                disabled={loading() || validLines().length === 0}
              >
                {totals().now === 0 && totals().wait > 0
                  ? "예약 신청"
                  : totals().wait > 0
                    ? "대여 신청 + 예약"
                    : "대여 신청"}
              </Button>
              <p class="mt-2 text-fine leading-normal text-ink-2">
                {totals().wait > 0
                  ? "예약분은 반납 순서대로 승인됩니다. 반납 예정일은 승인할 때 정해집니다."
                  : "신청 후 관리자가 승인하면 대여가 시작됩니다."}
              </p>
            </form>

            <button
              type="button"
              class="mt-4 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-fine text-ink-2 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
              onClick={() => {
                void confirmDialog("", {
                  title: "장바구니를 비우시겠습니까?",
                  description: "담은 물품이 모두 사라집니다.",
                  confirmLabel: "비우기",
                }).then((confirmed) => {
                  if (confirmed) cart.clear();
                });
              }}
            >
              장바구니 비우기
            </button>
          </aside>
        </div>
      </Show>
    </div>
  );
}
