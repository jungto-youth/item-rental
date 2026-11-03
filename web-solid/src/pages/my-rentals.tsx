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
import { ReservationRow } from "../components/common/reservation-row";

export default function MyRentals() {
  const [loading, setLoading] = createSignal(true);
  const [reservations, setReservations] = createSignal<MyReservation[]>([]);
  const [message, setMessage] = createSignal("");
  const [messageTone, setMessageTone] = createSignal<"info" | "success" | "error">(
    "info",
  );
  const [processing, setProcessing] = createSignal<{
    id: number;
    kind: "return" | "cancel";
  } | null>(null);

  const loadReservations = async () => {
    try {
      const res = await api<{ reservations: MyReservation[] }>(
        "/api/reservations/mine",
      );
      setReservations(res.reservations);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "대여 내역을 불러오지 못했어요",
      );
      setMessageTone("error");
    }
  };

  onSettled(() => {
    void session.ensure().then(async (user) => {
      setLoading(false);
      if (user) await loadReservations();
    });
  });

  const doCancel = async (reservation: MyReservation) => {
    if (processing()) return;
    setProcessing({ id: reservation.id, kind: "cancel" });
    try {
      await api(`/api/reservations/${reservation.id}/cancel`, { method: "POST" });
      setMessage(`${reservation.item_name} 대여를 취소했어요`);
      setMessageTone("success");
      await loadReservations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "취소하지 못했어요");
      setMessageTone("error");
    } finally {
      setProcessing(null);
    }
  };

  const doReturn = async (reservation: MyReservation) => {
    if (processing()) return;
    setProcessing({ id: reservation.id, kind: "return" });
    try {
      await api(`/api/reservations/${reservation.id}/return`, { method: "POST" });
      setMessage(`${reservation.item_name} 반납 완료 처리되었어요`);
      setMessageTone("success");
      await loadReservations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "반납 처리하지 못했어요");
      setMessageTone("error");
    } finally {
      setProcessing(null);
    }
  };

  const onReturn = async (reservation: MyReservation) => {
    if (processing()) return;
    if (
      !(await confirmDialog("", {
        title: `'${reservation.item_name}'를 반납할까요?`,
        description: "반납하면 재고가 바로 돌아오고, 대여 이력에 남아요.",
        confirmLabel: "반납",
      }))
    )
      return;
    await doReturn(reservation);
  };

  const onCancel = async (reservation: MyReservation) => {
    if (processing()) return;
    if (
      !(await confirmDialog("", {
        title: `'${reservation.item_name}' 대여를 취소할까요?`,
        description: "취소하면 대여하지 않은 것으로 기록돼요.",
        confirmLabel: "대여 취소",
      }))
    )
      return;
    await doCancel(reservation);
  };

  return (
    <div class="page-my-rentals">
      <Show when={!loading()} fallback={<Empty state="loading" />}>
        <Show
          when={session.user()}
          fallback={
            <Empty state="empty" text="로그인이 필요해요">
              <Button variant="primary" onClick={() => navigate("/login")}>
                로그인
              </Button>
            </Empty>
          }
        >
          {(_current) => {
            const rentedList = () =>
              reservations().filter((reservation) => reservation.status === "rented");
            const historyList = () =>
              reservations().filter(
                (reservation) =>
                  reservation.status === "returned" ||
                  reservation.status === "cancelled",
              );

            return (
              <>
                <PageHeader
                  title="대여 내역"
                  subtitle="지금 빌린 물품과 지난 기록을 확인해요."
                />

                <Show when={message()}>
                  <p
                    class={`msg ${messageTone()}`}
                    role={messageTone() === "error" ? "alert" : "status"}
                  >
                    <Show when={messageTone() === "success"}>
                      <CheckIcon />
                    </Show>
                    <span>{message()}</span>
                  </p>
                </Show>

                <div class="split">
                  <div class="main">
                    <section>
                      <h2>현재 대여 중</h2>
                      <Show
                        when={rentedList().length > 0}
                        fallback={
                          <div class="empty-card">
                            <p class="empty-title">현재 대여 중인 물품이 없어요</p>
                            <p class="empty-sub">
                              필요한 물품을 찾아 바로 대여할 수 있어요.
                            </p>
                            <Button
                              variant="secondary"
                              onClick={() => navigate("/")}
                            >
                              물품 둘러보기
                            </Button>
                          </div>
                        }
                      >
                        <div class="list">
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
                                  actions={
                                    <>
                                      <Button
                                        variant="primary"
                                        loading={
                                          mine() &&
                                          processing()?.kind === "return"
                                        }
                                        disabled={blocked()}
                                        onClick={() => void onReturn(reservation)}
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
                                  <Show when={reservation.member_memo}>
                                    <span>메모: {reservation.member_memo}</span>
                                  </Show>
                                </ReservationRow>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    </section>

                    <Show when={historyList().length > 0}>
                      <details open={rentedList().length === 0}>
                        <summary>
                          <span>대여 이력</span>
                          <ChevronDownIcon />
                        </summary>
                        <div class="history-list">
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
                                </span>
                                <Show when={reservation.member_memo}>
                                  <span>메모: {reservation.member_memo}</span>
                                </Show>
                              </ReservationRow>
                            )}
                          </For>
                        </div>
                      </details>
                    </Show>
                  </div>

                  <aside class="side side-hide" aria-label="대여 안내">
                    <section class="side-card">
                      <h2>반납 안내</h2>
                      <p>
                        대여 중인 물품은 <b>반납하기</b>를 눌러 바로 반납할 수
                        있어요. 취소는 빌리지 않기로 한 경우에만 사용해요.
                      </p>
                      <a href="/">물품 둘러보기</a>
                    </section>

                    <section class="side-card">
                      <h2>대여 이력</h2>
                      <p>
                        반납·취소한 물품은 아래 접이식 이력에서 다시 확인할 수
                        있어요.
                      </p>
                    </section>
                  </aside>
                </div>
              </>
            );
          }}
        </Show>
      </Show>
    </div>
  );
}
