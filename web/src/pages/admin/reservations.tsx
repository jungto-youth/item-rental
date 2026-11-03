import { For, Show, createMemo, createSignal, onSettled } from "solid-js";
import { api } from "../../api/client";
import { syncScrollKey } from "../../router";
import type { AdminReservation, ReservationStatus } from "../../types";
import { fmtKstDate } from "../../utils/date";
import { confirmDialog } from "../../utils/confirm";
import { AdminPage } from "../../components/admin/admin-page";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Empty } from "../../components/ui/empty";
import { ReservationRow } from "../../components/common/reservation-row";

type Filter = "" | ReservationStatus | "overdue";

export default function AdminReservations() {
  const [reservations, setReservations] = createSignal<AdminReservation[]>([]);
  const [truncated, setTruncated] = createSignal(false);
  const [filter, setFilter] = createSignal<Filter>("");
  const [loading, setLoading] = createSignal(true);
  const [processingId, setProcessingId] = createSignal<number | null>(null);
  const [message, setMessage] = createSignal("");
  const [messageTone, setMessageTone] = createSignal<"info" | "success" | "error">(
    "info",
  );
  const [error, setError] = createSignal("");

  const reload = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api<{
        reservations: AdminReservation[];
        truncated?: boolean;
      }>("/api/admin/reservations");
      setReservations(res.reservations);
      setTruncated(res.truncated === true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "대여 목록을 불러오지 못했어요",
      );
    } finally {
      setLoading(false);
    }
  };

  onSettled(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (status && ["rented", "returned", "cancelled", "overdue"].includes(status)) {
      setFilter(status as Filter);
    }
    void reload();
  });

  const changeFilter = (value: Filter) => {
    setFilter(value);
    const next = new URLSearchParams(window.location.search);
    if (value) next.set("status", value);
    else next.delete("status");
    const qs = next.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
    syncScrollKey();
  };

  const filtered = createMemo(() => {
    const value = filter();
    if (!value) return reservations();
    if (value === "overdue") {
      return reservations().filter(
        (reservation) =>
          reservation.status === "rented" && reservation.is_overdue,
      );
    }
    return reservations().filter((reservation) => reservation.status === value);
  });

  const markReturned = async (reservation: AdminReservation) => {
    if (processingId() !== null) return;
    const label =
      reservation.qty > 1
        ? `'${reservation.item_name}' ${reservation.qty}개`
        : `'${reservation.item_name}'`;
    if (
      !(await confirmDialog("", {
        title: `${label}를 반납 처리할까요?`,
        description: "반납 처리하면 재고가 바로 돌아오고, 대여 이력에 남아요.",
        confirmLabel: "반납",
      }))
    )
      return;
    setProcessingId(reservation.id);
    try {
      await api(`/api/admin/reservations/${reservation.id}/return`, {
        method: "POST",
      });
      setMessage("반납 처리했어요");
      setMessageTone("success");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "처리에 실패했어요");
      setMessageTone("error");
      await reload();
    } finally {
      setProcessingId(null);
    }
  };

  const contactLine = (reservation: AdminReservation) => {
    const phone = reservation.member_phone;
    const contact = phone ? (
      <a class="text-ink-1 underline underline-offset-2" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
        {phone}
      </a>
    ) : (
      reservation.member_email || "연락처 미등록"
    );
    return (
      <span>
        {reservation.member_name || "—"} · {contact}
      </span>
    );
  };

  return (
    <AdminPage
      title="대여 관리"
      subtitle="회원이 빌린 물품과 반납 상태를 확인해요."
      loading={loading()}
      error={error()}
      message={message()}
      messageTone={messageTone()}
      onRetry={() => void reload()}
      side
      sideContent={
        <section class="rounded-card border border-line bg-surface p-4">
          <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">반납 처리 안내</h2>
          <p class="mt-2 text-fine leading-normal text-ink-2">
            물품을 돌려받았으면 <b class="font-semibold text-ink-1">반납</b>을 눌러 상태를 바꿔 주세요. 회원이 직접
            반납한 건은 목록에서 따로 표시돼요. 반납 예정일이 지난 건은 상단에 먼저 모이고
            <b class="font-semibold text-ink-1">기한 지남</b> 필터로도 볼 수 있어요.
          </p>
        </section>
      }
      toolbar={
        <Chip
          ariaLabel="상태 필터"
          value={filter()}
          options={[
            { value: "", label: "전체" },
            { value: "rented", label: "대여 중" },
            { value: "overdue", label: "기한 지남" },
            { value: "returned", label: "반납 완료" },
            { value: "cancelled", label: "취소" },
          ]}
          onChange={(value) => changeFilter(value as Filter)}
        />
      }
    >
      <Show
        when={filtered().length > 0}
        fallback={
          <div class="mt-4 grid gap-2">
            <Empty
              state="empty"
              text={filter() ? "해당 상태의 대여가 없어요" : "대여가 없어요"}
              subtitle={filter() ? "다른 상태를 선택해 보세요." : ""}
            />
          </div>
        }
      >
        <Show when={truncated()}>
          <p class="mt-4 text-fine leading-normal text-ink-2" role="status">
            500건까지만 표시 — 더 오래된 건은 여기 없어요
          </p>
        </Show>
        <div class="mt-4 grid gap-2">
          <For each={filtered()}>
            {(reservation) => {
              const processing = () => processingId() === reservation.id;
              return (
                <ReservationRow
                  title={`${reservation.item_name} · ${reservation.qty}개`}
                  badgeKind={
                    reservation.status === "rented" && reservation.is_overdue
                      ? "overdue"
                      : reservation.status
                  }
                  active={reservation.status === "rented"}
                  inlineActions
                  actions={
                    <Show when={reservation.status === "rented"}>
                      <Button
                        variant="secondary"
                        loading={processing()}
                        disabled={processingId() !== null && !processing()}
                        onClick={() => void markReturned(reservation)}
                      >
                        반납
                      </Button>
                    </Show>
                  }
                >
                  {contactLine(reservation)}
                  <span>
                    {fmtKstDate(reservation.created_at)} 대여
                    {reservation.status === "returned"
                      ? ` → ${fmtKstDate(reservation.updated_at)} 반납`
                      : ""}
                    {reservation.status === "returned" && reservation.admin_name
                      ? ` · ${reservation.admin_name} 처리`
                      : ""}
                  </span>
                  <Show when={reservation.due_at}>
                    <span class={reservation.is_overdue ? "text-danger" : ""}>
                      반납 예정 {fmtKstDate(reservation.due_at!)}
                      {reservation.is_overdue ? " · 기한이 지났어요" : ""}
                    </span>
                  </Show>
                  <Show when={reservation.returned_by_member}>
                    <span class="text-fine text-danger">
                      회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요
                    </span>
                  </Show>
                  <Show when={reservation.member_memo}>
                    <span>메모 · {reservation.member_memo}</span>
                  </Show>
                </ReservationRow>
              );
            }}
          </For>
        </div>
      </Show>
    </AdminPage>
  );
}
