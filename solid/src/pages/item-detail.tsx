import { A, useParams } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  ImagePlaceholderIcon,
} from "../components/icons";
import { ItemCard } from "../components/item-card";
import {
  EmptyState,
  btnPrimary,
  btnSecondary,
  btnSecondarySmall,
  inputClass,
} from "../components/ui";
import { useAppStore } from "../store";
import type { Reservation } from "../types";

export default function ItemDetail() {
  const store = useAppStore();
  const params = useParams();
  const item = createMemo(() => store.findItem(params.id ?? ""));

  const [activePhoto, setActivePhoto] = createSignal(0);
  const [qty, setQty] = createSignal(1);
  const [memo, setMemo] = createSignal("");
  const [result, setResult] = createSignal<Reservation | null>(null);

  const maxQty = () => Math.max(1, item()?.available ?? 1);

  const setQuantity = (next: number) => {
    const value = Math.min(maxQty(), Math.max(1, Number(next) || 1));
    setQty(value);
  };

  const related = createMemo(() => {
    const current = item();
    if (!current) return [];
    return store.state.items
      .filter(
        (entry) =>
          entry.id !== current.id &&
          entry.category === current.category &&
          entry.lifecycle === "active" &&
          entry.kind === "rental",
      )
      .slice(0, 4);
  });

  const unavailableReason = createMemo(() => {
    const current = item();
    if (!current) return null;
    if (current.lifecycle === "retired") {
      return {
        tone: "danger" as const,
        text: "더 이상 대여하지 않는 물품이에요.",
      };
    }
    if (current.kind === "consumable") {
      return {
        tone: "muted" as const,
        text: "소모품이에요 — 별도 대여 신청 없이 관리자에게 문의해 주세요.",
      };
    }
    if (current.available === 0) {
      return {
        tone: "danger" as const,
        text: "지금은 재고가 없어요 — 반납 후 다시 시도해 주세요.",
      };
    }
    return null;
  });

  const submitRental = (event: SubmitEvent) => {
    event.preventDefault();
    const current = item();
    if (!current) return;
    const reservation = store.rentItem(current.id, qty(), memo());
    if (reservation) setResult(reservation);
  };

  return (
    <Show
      when={item()}
      fallback={
        <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          <EmptyState
            icon={<AlertCircleIcon class="h-6 w-6" />}
            title="물품 정보를 불러오지 못했어요"
            description="삭제되었거나 연결이 불안정해요."
            action={
              <div class="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  class={btnPrimary}
                  onClick={() => location.reload()}
                >
                  다시 시도
                </button>
                <A href="/" class={btnSecondary}>
                  목록으로
                </A>
              </div>
            }
          />
        </main>
      }
    >
      {(current) => (
        <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          <div class="flex items-center justify-between gap-4">
            <A
              href="/"
              class="inline-flex h-9 items-center gap-1 rounded-card text-body font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowLeftIcon class="h-4 w-4" />
              목록으로
            </A>
            <Show when={store.isAdmin()}>
              <A
                href={`/items/${current().id}/edit`}
                class={btnSecondarySmall}
              >
                수정
              </A>
            </Show>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section aria-label="물품 사진">
              <div class="relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface-muted">
                <Show
                  when={current().photos[activePhoto()]}
                  fallback={
                    <span class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-3">
                      <ImagePlaceholderIcon class="h-8 w-8" />
                      <span class="text-fine text-ink-2">사진 없음</span>
                    </span>
                  }
                >
                  {(src) => (
                    <img
                      src={src()}
                      alt={current().name}
                      class="h-full w-full object-cover"
                      onError={(event) => event.currentTarget.remove()}
                    />
                  )}
                </Show>
                <Show when={current().photos.length > 0}>
                  <span class="absolute bottom-3 right-3 rounded-pill bg-ink-1/70 px-2 py-1 text-fine tabular-nums text-white">
                    {activePhoto() + 1} / {current().photos.length}
                  </span>
                </Show>
              </div>

              <Show when={current().photos.length > 1}>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <For each={current().photos}>
                    {(src, index) => (
                      <button
                        type="button"
                        aria-label={`사진 ${index() + 1} 보기`}
                        aria-current={
                          activePhoto() === index() ? "true" : undefined
                        }
                        data-active={activePhoto() === index()}
                        class="thumb overflow-hidden rounded-card bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        onClick={() => setActivePhoto(index())}
                      >
                        <img
                          src={src}
                          alt=""
                          class="aspect-[4/3] w-full object-cover"
                        />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
                  {current().name}
                </h1>
                <span class="inline-flex h-7 items-center rounded-pill bg-primary-soft px-3 text-fine font-medium text-primary-strong">
                  대여 가능 {current().available}개
                </span>
              </div>

              <p class="mt-4 text-body leading-[1.5] text-ink-2">
                {current().description}
              </p>

              <div class="mt-4 flex flex-wrap gap-2" aria-label="분류">
                <For each={current().tags}>
                  {(tag) => (
                    <span class="inline-flex h-7 items-center rounded-pill bg-primary-soft px-3 text-fine text-primary-strong">
                      #{tag}
                    </span>
                  )}
                </For>
              </div>

              <dl class="mt-6 divide-y divide-line border-y border-line">
                <div class="flex items-center justify-between gap-4 py-2">
                  <dt class="text-fine text-ink-2">대여 가능</dt>
                  <dd class="text-body font-semibold tabular-nums text-ink-1">
                    {current().available}개
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-2">
                  <dt class="text-fine text-ink-2">전체 보유</dt>
                  <dd class="text-body tabular-nums text-ink-1">
                    {current().total}개
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-2">
                  <dt class="text-fine text-ink-2">수리 중</dt>
                  <dd class="text-body tabular-nums text-ink-1">
                    {current().repair}개
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-2">
                  <dt class="text-fine text-ink-2">보관 위치</dt>
                  <dd class="text-body text-ink-1">{current().location}</dd>
                </div>
              </dl>

              <Show
                when={result()}
                fallback={
                  <Show
                    when={!unavailableReason()}
                    fallback={
                      <div class="mt-6 rounded-card border border-line bg-surface p-6 max-sm:p-4">
                        <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
                          대여 신청
                        </h2>
                        <div class="my-4 border-t border-dashed border-line" />
                        <p
                          class={`rounded-card px-4 py-2 text-fine ${
                            unavailableReason()?.tone === "danger"
                              ? "bg-danger-soft text-danger"
                              : "bg-surface-muted text-ink-1"
                          }`}
                        >
                          {unavailableReason()?.text}
                        </p>
                      </div>
                    }
                  >
                    <form
                      class="mt-6 rounded-card border border-line bg-surface p-6 max-sm:p-4"
                      onSubmit={submitRental}
                    >
                      <div class="flex items-baseline justify-between gap-4">
                        <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
                          대여 신청
                        </h2>
                        <span class="text-fine text-ink-2">
                          대여 가능{" "}
                          <b class="font-semibold tabular-nums text-ink-1">
                            {current().available}개
                          </b>
                        </span>
                      </div>

                      <div
                        class="my-4 border-t border-dashed border-line"
                        aria-hidden="true"
                      />

                      <div class="flex items-center justify-between gap-4">
                        <label for="qty" class="text-fine font-medium text-ink-2">
                          대여 수량
                        </label>
                        <div class="flex h-10 items-center rounded-card border border-line bg-surface">
                          <button
                            type="button"
                            disabled={qty() <= 1}
                            aria-label="수량 감소"
                            class="flex h-10 w-10 items-center justify-center text-lg text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setQuantity(qty() - 1)}
                          >
                            −
                          </button>
                          <input
                            id="qty"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            max={maxQty()}
                            value={qty()}
                            aria-label="대여 수량"
                            class="h-10 w-12 border-x border-line bg-transparent text-center text-body font-semibold tabular-nums text-ink-1 outline-none focus:border-primary"
                            onInput={(event) =>
                              setQuantity(Number(event.currentTarget.value))
                            }
                            onChange={(event) =>
                              setQuantity(Number(event.currentTarget.value))
                            }
                          />
                          <button
                            type="button"
                            disabled={qty() >= maxQty()}
                            aria-label="수량 증가"
                            class="flex h-10 w-10 items-center justify-center text-lg text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setQuantity(qty() + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <label for="memo" class="mt-4 block">
                        <span class="text-fine font-medium text-ink-2">
                          메모 (선택)
                        </span>
                        <input
                          id="memo"
                          type="text"
                          value={memo()}
                          placeholder="용도, 수령처 등"
                          class={`${inputClass} mt-2`}
                          onInput={(event) =>
                            setMemo(event.currentTarget.value)
                          }
                        />
                      </label>

                      <button type="submit" class={`${btnPrimary} mt-6 w-full`}>
                        대여하기
                      </button>
                      <p class="mt-2 text-fine text-ink-2">
                        신청하면 바로 대여 중이 돼요. 반납은 대여 기록에서 할 수
                        있어요.
                      </p>
                    </form>
                  </Show>
                }
              >
                {(reservation) => (
                  <div class="mt-6 rounded-card border border-line bg-surface p-6 text-center max-sm:p-4">
                    <span
                      class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-primary-soft text-primary-strong"
                      aria-hidden="true"
                    >
                      <CheckIcon class="h-6 w-6" />
                    </span>
                    <p class="mt-4 text-body font-semibold text-ink-1">
                      대여했어요
                    </p>
                    <p class="mt-2 text-fine text-ink-2">
                      '{reservation().itemName}' {reservation().qty}개를 대여
                      중이에요.
                      <br />
                      반납은 대여 기록에서 할 수 있어요.
                    </p>
                    <div class="mt-4 flex flex-wrap justify-center gap-2">
                      <A href="/my-rentals" class={btnPrimary}>
                        대여 기록
                      </A>
                      <A href="/" class={btnSecondary}>
                        계속 둘러보기
                      </A>
                    </div>
                  </div>
                )}
              </Show>
            </section>
          </div>

          <Show when={related().length > 0}>
            <section class="mt-10 border-t border-line pt-8">
              <div class="flex items-end justify-between gap-4">
                <div>
                  <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
                    {current().category} 물품 더 보기
                  </h2>
                  <p class="mt-2 text-fine text-ink-2">
                    함께 쓰면 좋은 물품이에요
                  </p>
                </div>
                <A
                  href="/"
                  class="text-body font-medium text-primary-strong transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  전체 보기
                </A>
              </div>
              <div
                class="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"
                role="list"
              >
                <For each={related()}>{(entry) => <ItemCard item={entry} />}</For>
              </div>
            </section>
          </Show>
        </main>
      )}
    </Show>
  );
}
