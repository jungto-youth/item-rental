import { For, Show, createMemo, createSignal } from "solid-js";
import { AdminGuard } from "../components/admin-guard";
import {
  ConfirmModal,
  FilterChip,
  PageMessage,
  SideCard,
  StatusBadge,
  btnSecondarySmall,
} from "../components/ui";
import { useAppStore } from "../store";
import type { Reservation, ReservationStatus } from "../types";

type Filter = "all" | ReservationStatus;

const FILTERS: [Filter, string][] = [
  ["all", "전체"],
  ["rented", "대여 중"],
  ["returned", "반납 완료"],
  ["cancelled", "취소"],
];

const STATUS_LABEL: Record<ReservationStatus, string> = {
  rented: "대여 중",
  returned: "반납 완료",
  cancelled: "취소",
};

export default function AdminReservations() {
  const store = useAppStore();
  const [filter, setFilter] = createSignal<Filter>("all");
  const [pending, setPending] = createSignal<Reservation | null>(null);
  const [message, setMessage] = createSignal("");

  const visible = createMemo(() =>
    store.state.reservations.filter(
      (row) => filter() === "all" || row.status === filter(),
    ),
  );

  const confirm = () => {
    const row = pending();
    if (!row) return;
    store.returnReservation(row.id);
    setMessage("반납 처리했어요");
    setPending(null);
  };

  return (
    <AdminGuard>
      <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        <div>
          <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
            대여 관리
          </h1>
          <p class="mt-2 text-fine text-ink-2">
            회원이 빌린 물품과 반납 상태를 확인해요.
          </p>
        </div>

        <PageMessage show={message() !== ""}>{message()}</PageMessage>

        <div class="page-split side-first mt-6">
          <div class="page-main">
            <div
              class="flex flex-wrap items-center gap-2"
              aria-label="대여 상태 필터"
            >
              <For each={FILTERS}>
                {([value, label]) => (
                  <FilterChip
                    active={filter() === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </FilterChip>
                )}
              </For>
            </div>

            <Show
              when={visible().length > 0}
              fallback={
                <div class="mt-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
                  <p class="text-body font-semibold text-ink-1">
                    해당 상태의 대여가 없어요
                  </p>
                  <p class="mt-2 text-fine text-ink-2">
                    다른 상태를 선택해 보세요.
                  </p>
                </div>
              }
            >
              <div class="mt-4 space-y-2">
                <For each={visible()}>
                  {(row) => (
                    <article
                      class={`rounded-card border bg-surface p-4 ${
                        row.status === "rented"
                          ? "border-ink-1"
                          : "border-line"
                      }`}
                    >
                      <div class="flex flex-wrap items-center gap-3">
                        <h3 class="min-w-0 flex-1 truncate text-body font-semibold tracking-[-0.015em] text-ink-1">
                          {row.itemName} · {row.qty}개
                        </h3>
                        <StatusBadge>{STATUS_LABEL[row.status]}</StatusBadge>
                        <Show when={row.status === "rented"}>
                          <button
                            type="button"
                            class={`${btnSecondarySmall} flex-none`}
                            onClick={() => setPending(row)}
                          >
                            반납
                          </button>
                        </Show>
                      </div>
                      <div class="mt-2 space-y-1 text-fine text-ink-2">
                        <p>
                          {row.memberName} ·{" "}
                          <a
                            href={`tel:${row.phone.replaceAll("-", "")}`}
                            class="text-ink-1 underline underline-offset-2"
                          >
                            {row.phone}
                          </a>
                        </p>
                        <p>
                          {row.status === "returned"
                            ? `${row.rentedAt} 대여 → ${row.returnedAt} 반납${row.processedBy ? ` · ${row.processedBy} 처리` : ""}`
                            : row.status === "cancelled"
                              ? `${row.rentedAt} 대여 신청`
                              : `${row.rentedAt} 대여`}
                        </p>
                        <Show when={row.memberReturned}>
                          <p class="text-danger">
                            회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요
                          </p>
                        </Show>
                        <Show when={row.memo}>
                          <p>메모 · {row.memo}</p>
                        </Show>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <aside class="page-side page-side-hide" aria-label="반납 처리 안내">
            <SideCard title="반납 처리 안내">
              물품을 돌려받았으면{" "}
              <b class="font-semibold text-ink-1">반납</b>을 눌러 상태를 바꿔
              주세요. 회원이 직접 반납한 건은 목록에서 따로 표시돼요.
            </SideCard>
          </aside>
        </div>

        <ConfirmModal
          open={pending() !== null}
          title={`'${pending()?.itemName}'${(pending()?.qty ?? 1) > 1 ? ` ${pending()?.qty}개` : ""}를 반납 처리할까요?`}
          description="반납 처리하면 재고가 바로 돌아오고, 대여 이력에 남아요."
          confirmLabel="반납"
          cancelLabel="닫기"
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      </main>
    </AdminGuard>
  );
}
