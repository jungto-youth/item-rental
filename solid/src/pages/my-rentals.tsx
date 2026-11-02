import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import {
  ConfirmModal,
  PageMessage,
  SideCard,
  StatusBadge,
  btnPrimarySmall,
  btnSecondary,
  btnSecondarySmall,
} from "../components/ui";
import { useAppStore } from "../store";
import type { Reservation } from "../types";

type PendingAction = {
  id: string;
  name: string;
  action: "return" | "cancel";
};

export default function MyRentals() {
  const store = useAppStore();
  const [pending, setPending] = createSignal<PendingAction | null>(null);
  const [message, setMessage] = createSignal("");
  const [historyOpen, setHistoryOpen] = createSignal(false);

  const active = createMemo(() =>
    store.state.myReservations.filter((row) => row.status === "rented"),
  );
  const history = createMemo(() =>
    store.state.myReservations.filter((row) => row.status !== "rented"),
  );

  const openConfirm = (row: Reservation, action: "return" | "cancel") => {
    setPending({ id: row.id, name: row.itemName, action });
  };

  const confirm = () => {
    const action = pending();
    if (!action) return;
    if (action.action === "return") {
      store.returnMyReservation(action.id);
      setMessage(`${action.name} 반납 완료 처리되었어요`);
    } else {
      store.cancelMyReservation(action.id);
      setMessage(`${action.name} 대여를 취소했어요`);
    }
    setPending(null);
    if (active().length === 0) setHistoryOpen(true);
  };

  return (
    <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <div>
        <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
          대여 내역
        </h1>
        <p class="mt-2 text-fine text-ink-2">
          지금 빌린 물품과 지난 기록을 확인해요.
        </p>
      </div>

      <PageMessage show={message() !== ""}>{message()}</PageMessage>

      <div class="page-split mt-6">
        <div class="page-main">
          <section>
            <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
              현재 대여 중
            </h2>

            <Show
              when={active().length > 0}
              fallback={
                <div class="mt-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
                  <p class="text-body font-semibold text-ink-1">
                    현재 대여 중인 물품이 없어요
                  </p>
                  <p class="mt-2 text-fine text-ink-2">
                    필요한 물품을 찾아 바로 대여할 수 있어요.
                  </p>
                  <A href="/" class={`${btnSecondary} mt-4`}>
                    물품 둘러보기
                  </A>
                </div>
              }
            >
              <div class="mt-4 space-y-2">
                <For each={active()}>
                  {(row) => (
                    <article class="rounded-card border border-ink-1 bg-surface p-4">
                      <div class="flex flex-wrap items-center gap-3">
                        <h3 class="min-w-0 flex-1 truncate text-body font-semibold tracking-[-0.015em] text-ink-1">
                          {row.itemName} · {row.qty}개
                        </h3>
                        <div class="flex w-full gap-2 sm:w-auto">
                          <button
                            type="button"
                            class={`${btnPrimarySmall} flex-1 sm:flex-none`}
                            onClick={() => openConfirm(row, "return")}
                          >
                            반납하기
                          </button>
                          <button
                            type="button"
                            class={`${btnSecondarySmall} flex-1 sm:flex-none`}
                            onClick={() => openConfirm(row, "cancel")}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                      <div class="mt-2 space-y-1 text-fine text-ink-2">
                        <p>{row.rentedAt} 대여 신청</p>
                        <Show when={row.memo}>
                          <p>메모: {row.memo}</p>
                        </Show>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <details class="mt-8" open={historyOpen()}>
            <summary class="plain-summary flex cursor-pointer items-center justify-between gap-4 text-heading font-semibold tracking-[-0.015em] text-ink-1">
              <span>대여 이력</span>
              <svg
                class="chevron h-5 w-5 flex-none text-ink-2 transition-transform"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>

            <div class="mt-4 space-y-2">
              <For each={history()}>
                {(row) => (
                  <article class="rounded-card border border-line bg-surface p-4">
                    <div class="flex flex-wrap items-center gap-3">
                      <h3 class="min-w-0 flex-1 truncate text-body font-semibold tracking-[-0.015em] text-ink-1">
                        {row.itemName} · {row.qty}개
                      </h3>
                      <StatusBadge>
                        {row.status === "returned" ? "반납 완료" : "취소"}
                      </StatusBadge>
                    </div>
                    <div class="mt-2 space-y-1 text-fine text-ink-2">
                      <p>
                        {row.status === "returned"
                          ? `${row.rentedAt} 대여 → ${row.returnedAt} 반납`
                          : `${row.rentedAt} 대여 신청`}
                      </p>
                      <Show when={row.memo}>
                        <p>메모: {row.memo}</p>
                      </Show>
                    </div>
                  </article>
                )}
              </For>
            </div>
          </details>
        </div>

        <aside class="page-side" aria-label="대여 안내">
          <section class="page-side-hide rounded-card border border-line bg-surface p-4">
            <h2 class="text-body font-semibold tracking-[-0.015em] text-ink-1">
              반납 안내
            </h2>
            <p class="mt-2 text-fine leading-[1.5] text-ink-2">
              대여 중인 물품은 <b class="font-semibold text-ink-1">반납하기</b>
              를 눌러 바로 반납할 수 있어요. 취소는 빌리지 않기로 한 경우에만
              사용해요.
            </p>
            <A href="/" class={`${btnSecondarySmall} mt-4`}>
              물품 둘러보기
            </A>
          </section>

          <SideCard title="대여 이력">
            반납·취소한 물품은 아래 접이식 이력에서 다시 확인할 수 있어요.
          </SideCard>
        </aside>
      </div>

      <ConfirmModal
        open={pending() !== null}
        title={
          pending()?.action === "return"
            ? `'${pending()?.name}'를 반납할까요?`
            : `'${pending()?.name}' 대여를 취소할까요?`
        }
        description={
          pending()?.action === "return"
            ? "반납하면 재고가 바로 돌아오고, 대여 이력에 남아요."
            : "취소하면 대여하지 않은 것으로 기록돼요."
        }
        confirmLabel={pending()?.action === "return" ? "반납" : "대여 취소"}
        cancelLabel="닫기"
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </main>
  );
}
