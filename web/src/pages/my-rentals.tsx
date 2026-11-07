import { For, Show, createSignal, onSettled } from "solid-js";
import { api } from "../api/client";
import { session } from "../context/session";
import { navigate } from "../router";
import type { MyReservation } from "../types";
import { fmtKstDate } from "../utils/date";
import { confirmDialog } from "../utils/confirm";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { PageHeader } from "../components/ui/page-header";
import { ChevronDownIcon, CheckIcon } from "../components/icons";
import {
  ReservationListSkeleton,
  ReservationRow,
} from "../components/common/reservation-row";
import { ReturnDialog, type ReturnDialogResult } from "../components/features/rental/return-dialog";
import { ReturnPhotoStrip } from "../components/features/rental/return-photo-strip";
import { Skeleton } from "../components/ui/skeleton";

export default function MyRentals() {
  const [loading, setLoading] = createSignal(true);
  const [reservations, setReservations] = createSignal<MyReservation[]>([]);
  const [message, setMessage] = createSignal("");
  const [messageTone, setMessageTone] = createSignal<"info" | "success" | "error">(
    "info",
  );
  const [processing, setProcessing] = createSignal<{
    id: number;
    kind: "cancel";
  } | null>(null);
  const [returnTarget, setReturnTarget] = createSignal<MyReservation | null>(
    null,
  );

  const loadReservations = async () => {
    try {
      const res = await api<{ reservations: MyReservation[] }>(
        "/api/reservations/mine",
      );
      setReservations(res.reservations);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "대여 내역을 불러오지 못했습니다",
      );
      setMessageTone("error");
    }
  };

  onSettled(() => {
    void (async () => {
      try {
        const user = await session.ensure();
        if (user) await loadReservations();
      } finally {
        // 세션 확인과 대여 조회가 모두 끝나야 목록을 그린다 —
        // 먼저 끝난 쪽이 빈 상태를 잠깐 보여주지 않게
        setLoading(false);
      }
    })();
  });

  const doCancel = async (reservation: MyReservation) => {
    if (processing()) return;
    setProcessing({ id: reservation.id, kind: "cancel" });
    try {
      await api(`/api/reservations/${reservation.id}/cancel`, { method: "POST" });
      setMessage(
        `${reservation.item_name} ${
          reservation.status === "reserved" ? "예약" : "대여"
        }를 취소했습니다`,
      );
      setMessageTone("success");
      await loadReservations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "취소하지 못했습니다");
      setMessageTone("error");
    } finally {
      setProcessing(null);
    }
  };

  const finishReturn = async (result: ReturnDialogResult) => {
    setReturnTarget(null);
    setMessage(result.message);
    setMessageTone(result.tone);
    await loadReservations();
  };

  const onReturn = (reservation: MyReservation) => {
    if (processing()) return;
    // 사진 첨부·반납은 모달이 맡는다 — 사진이 없어도 그대로 진행할 수 있다.
    setReturnTarget(reservation);
  };

  const onCancel = async (reservation: MyReservation) => {
    if (processing()) return;
    const waiting = reservation.status === "reserved";
    if (
      !(await confirmDialog("", {
        title: `'${reservation.item_name}' ${
          waiting ? "예약" : "대여"
        }를 취소하시겠습니까?`,
        description: waiting
          ? "대기열에서 빠지며, 나중에 다시 신청할 수 있습니다."
          : "취소하면 대여하지 않은 것으로 기록됩니다.",
        confirmLabel: waiting ? "예약 취소" : "대여 취소",
      }))
    )
      return;
    await doCancel(reservation);
  };

  const renderSkeleton = () => (
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-w-0">
        <Skeleton class="h-6 w-28 rounded" />
        <div class="mt-4">
          <ReservationListSkeleton
            label="대여 내역을 불러오는 중"
            rows={3}
          />
        </div>
      </div>
      <aside
        class="flex flex-col gap-4 max-lg:hidden"
        aria-hidden="true"
      >
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-4/5 rounded" />
          <Skeleton tone="muted" class="mt-4 h-10 w-32 rounded-card" />
        </div>
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-3/4 rounded" />
        </div>
      </aside>
    </div>
  );

  return (
    <div class="block">
      <Show
        when={!loading()}
        fallback={
          <>
            <PageHeader
              title="대여 내역"
              subtitle="신청한 물품의 승인 상태와 지난 기록을 확인합니다."
            />
            {renderSkeleton()}
          </>
        }
      >
        <Show
          when={session.user()}
          fallback={
            <Empty state="empty" text="로그인이 필요합니다">
              <Button variant="primary" onClick={() => navigate("/login")}>
                로그인
              </Button>
            </Empty>
          }
        >
          {(_current) => {
            const pendingList = () =>
              reservations().filter(
                (reservation) => reservation.status === "pending",
              );
            const reservedList = () =>
              reservations().filter(
                (reservation) => reservation.status === "reserved",
              );
            const rentedList = () =>
              reservations().filter((reservation) => reservation.status === "rented");
            const historyList = () =>
              reservations().filter(
                (reservation) =>
                  reservation.status === "returned" ||
                  reservation.status === "cancelled" ||
                  reservation.status === "rejected",
              );

            return (
              <>
                <PageHeader
                  title="대여 내역"
                  subtitle="신청한 물품의 승인 상태와 지난 기록을 확인합니다."
                />

                <Show when={message()}>
                  <p
                    class={`mb-6 flex min-h-[1.2em] items-center gap-1 text-fine [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary-strong ${messageTone() === "error" ? "text-danger" : "text-ink-1"}`}
                    role={messageTone() === "error" ? "alert" : "status"}
                  >
                    <Show when={messageTone() === "success"}>
                      <CheckIcon />
                    </Show>
                    <span>{message()}</span>
                  </p>
                </Show>

                <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div class="min-w-0">
                    <Show when={pendingList().length > 0}>
                      <section class="mb-8">
                        <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">
                          승인 대기
                        </h2>
                        <p class="mt-2 text-fine leading-normal text-ink-2">
                          관리자가 승인하면 대여가 시작됩니다.
                        </p>
                        <div class="mt-4 grid gap-2">
                          <For each={pendingList()}>
                            {(reservation) => {
                              const mine = () =>
                                processing()?.id === reservation.id;
                              const blocked = () =>
                                processing() !== null && !mine();
                              return (
                                <ReservationRow
                                  title={`${reservation.item_name} · ${reservation.qty}개`}
                                  badgeKind="pending"
                                  actions={
                                    <Button
                                      variant="secondary"
                                      loading={
                                        mine() &&
                                        processing()?.kind === "cancel"
                                      }
                                      disabled={blocked()}
                                      onClick={() => void onCancel(reservation)}
                                    >
                                      신청 취소
                                    </Button>
                                  }
                                >
                                  <span>
                                    {fmtKstDate(reservation.created_at)} 신청
                                  </span>
                                  <Show when={reservation.due_at}>
                                    <span>
                                      희망 반납일 {fmtKstDate(reservation.due_at!)}
                                    </span>
                                  </Show>
                                  <Show when={reservation.member_memo}>
                                    <span>메모: {reservation.member_memo}</span>
                                  </Show>
                                </ReservationRow>
                              );
                            }}
                          </For>
                        </div>
                      </section>
                    </Show>

                    <Show when={reservedList().length > 0}>
                      <section class="mb-8">
                        <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">
                          예약 대기
                        </h2>
                        <p class="mt-2 text-fine leading-normal text-ink-2">
                          지금은 재고가 없어 반납을 기다리고 있습니다. 반납되면 오래된 예약부터
                          승인되며, 반납 예정일은 승인할 때 정해집니다.
                        </p>
                        <div class="mt-4 grid gap-2">
                          <For each={reservedList()}>
                            {(reservation) => {
                              const mine = () =>
                                processing()?.id === reservation.id;
                              const blocked = () =>
                                processing() !== null && !mine();
                              return (
                                <ReservationRow
                                  title={`${reservation.item_name} · ${reservation.qty}개`}
                                  badgeKind="reserved"
                                  actions={
                                    <Button
                                      variant="secondary"
                                      loading={
                                        mine() &&
                                        processing()?.kind === "cancel"
                                      }
                                      disabled={blocked()}
                                      onClick={() => void onCancel(reservation)}
                                    >
                                      예약 취소
                                    </Button>
                                  }
                                >
                                  <span>
                                    {fmtKstDate(reservation.created_at)} 예약
                                  </span>
                                  <Show when={(reservation.queue_ahead_qty ?? 0) > 0}>
                                    <span>
                                      앞에 {reservation.queue_ahead_qty}개 대기 중
                                    </span>
                                  </Show>
                                  <Show when={!reservation.queue_ahead_qty}>
                                    <span>다음 순번입니다</span>
                                  </Show>
                                  <Show when={reservation.member_memo}>
                                    <span>메모: {reservation.member_memo}</span>
                                  </Show>
                                </ReservationRow>
                              );
                            }}
                          </For>
                        </div>
                      </section>
                    </Show>

                    <section>
                      <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">현재 대여 중</h2>
                      <Show
                        when={rentedList().length > 0}
                        fallback={
                          <div class="mt-4 box-border rounded-card border border-line bg-surface px-6 py-10 text-center">
                            <p class="m-0 text-body font-semibold text-ink-1">현재 대여 중인 물품이 없습니다</p>
                            <p class="mt-2 text-fine text-ink-2">
                              필요한 물품을 찾아 대여를 신청할 수 있습니다.
                            </p>
                            <Button
                              class="mt-4"
                              variant="secondary"
                              onClick={() => navigate("/")}
                            >
                              물품 둘러보기
                            </Button>
                          </div>
                        }
                      >
                        <div class="mt-4 grid gap-2">
                          <For each={rentedList()}>
                            {(reservation) => {
                              const mine = () =>
                                processing()?.id === reservation.id;
                              const blocked = () =>
                                processing() !== null && !mine();
                              return (
                                <ReservationRow
                                  active
                                  title={`${reservation.item_name} · ${reservation.qty}개`}
                                  badgeKind={
                                    reservation.is_overdue ? "overdue" : undefined
                                  }
                                  actions={
                                    <>
                                      <Button
                                        variant="primary"
                                        disabled={blocked()}
                                        onClick={() => onReturn(reservation)}
                                      >
                                        반납하기
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        loading={
                                          mine() &&
                                          processing()?.kind === "cancel"
                                        }
                                        disabled={blocked()}
                                        onClick={() => void onCancel(reservation)}
                                      >
                                        취소
                                      </Button>
                                    </>
                                  }
                                >
                                  <span>
                                    {fmtKstDate(reservation.created_at)} 대여 신청
                                  </span>
                                  <Show when={reservation.due_at}>
                                    <span
                                      class={
                                        reservation.is_overdue ? "text-danger" : ""
                                      }
                                    >
                                      반납 예정 {fmtKstDate(reservation.due_at!)}
                                      {reservation.is_overdue
                                        ? " · 기한이 지났습니다"
                                        : ""}
                                    </span>
                                  </Show>
                                  <Show when={reservation.member_memo}>
                                    <span>메모: {reservation.member_memo}</span>
                                  </Show>
                                  <Show when={reservation.return_photos.length > 0}>
                                    <ReturnPhotoStrip
                                      photos={reservation.return_photos}
                                    />
                                  </Show>
                                </ReservationRow>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    </section>

                    <Show when={historyList().length > 0}>
                      <details class="mt-8 [&[open]_summary_svg]:rotate-180" open={rentedList().length === 0 && pendingList().length === 0 && reservedList().length === 0}>
                        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-heading leading-normal font-semibold tracking-tight text-ink-1 select-none [&::-webkit-details-marker]:hidden [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-ink-2 [&_svg]:transition-transform [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-4 [&:focus-visible]:rounded-card">
                          <span>대여 이력</span>
                          <ChevronDownIcon />
                        </summary>
                        <div class="mt-4 grid gap-2">
                          <For each={historyList()}>
                            {(reservation) => (
                              <ReservationRow
                                title={`${reservation.item_name} · ${reservation.qty}개`}
                                badgeKind={reservation.status}
                              >
                                <span>
                                  {fmtKstDate(reservation.created_at)} 대여
                                  {reservation.status === "returned"
                                    ? ` → ${fmtKstDate(reservation.updated_at)} 반납`
                                    : ""}
                                  {reservation.status === "rejected"
                                    ? ` → ${fmtKstDate(reservation.decided_at ?? reservation.updated_at)} 거절`
                                    : ""}
                                </span>
                                <Show when={reservation.rejected_reason}>
                                  <span class="text-danger">
                                    거절 사유: {reservation.rejected_reason}
                                  </span>
                                </Show>
                                <Show when={reservation.member_memo}>
                                  <span>메모: {reservation.member_memo}</span>
                                </Show>
                                <Show when={reservation.return_note}>
                                  <span>반납 특이사항: {reservation.return_note}</span>
                                </Show>
                                <Show when={reservation.return_photos.length > 0}>
                                  <ReturnPhotoStrip
                                    photos={reservation.return_photos}
                                  />
                                </Show>
                              </ReservationRow>
                            )}
                          </For>
                        </div>
                      </details>
                    </Show>
                  </div>

                  <aside class="flex flex-col gap-4 max-lg:hidden lg:sticky lg:top-24" aria-label="대여 안내">
                    <section class="rounded-card border border-line bg-surface p-4">
                      <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">반납 안내</h2>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        승인 대기·예약 대기 중인 신청은 <b class="font-semibold text-ink-1">취소</b>할
                        수 있습니다. 예약은 반납 순서대로 승인되며, 대여가 시작되면{" "}
                        <b class="font-semibold text-ink-1">반납하기</b>를 눌러 바로 반납합니다.
                        반납할 때 물품 상태 사진을 남길 수 있고, 반납 예정일이 지나면{" "}
                        <b class="font-semibold text-ink-1">기한 지남</b>으로 표시됩니다.
                      </p>
                      <a class="mt-4 inline-flex h-10 items-center rounded-card border border-line bg-surface px-4 text-fine font-medium text-ink-1 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1" href="/">물품 둘러보기</a>
                    </section>

                    <section class="rounded-card border border-line bg-surface p-4">
                      <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">대여 이력</h2>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        반납·취소한 물품은 아래 접이식 이력에서 다시 확인할 수
                        있습니다.
                      </p>
                    </section>
                  </aside>
                </div>
              </>
            );
          }}
        </Show>
      </Show>

      <ReturnDialog
        open={returnTarget() !== null}
        reservation={returnTarget()}
        mode="member"
        onClose={() => setReturnTarget(null)}
        onFinished={(result) => void finishReturn(result)}
      />
    </div>
  );
}
