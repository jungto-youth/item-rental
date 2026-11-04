import { For, Show, createMemo, createSignal, onSettled } from "solid-js";
import { api, ApiError } from "../../api/client";
import { syncScrollKey } from "../../router";
import type { AdminReservation, ReservationStatus } from "../../types";
import { fmtKstDate } from "../../utils/date";
import {
  defaultDueDateKst,
  isDueDateInRange,
  maxDueDateKst,
  minDueDateKst,
} from "../../../../shared/rental-period";
import { AdminPage } from "../../components/admin/admin-page";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Empty } from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { Modal } from "../../components/ui/modal";
import { ReservationRow, ReservationListSkeleton } from "../../components/common/reservation-row";
import { ReturnDialog, type ReturnDialogResult } from "../../components/features/rental/return-dialog";
import { ReturnPhotoStrip } from "../../components/features/rental/return-photo-strip";

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
  const [approveTarget, setApproveTarget] = createSignal<AdminReservation | null>(
    null,
  );
  const [approveDueDate, setApproveDueDate] = createSignal(defaultDueDateKst());
  const [approveError, setApproveError] = createSignal("");
  const [approveBusy, setApproveBusy] = createSignal(false);
  const [rejectTarget, setRejectTarget] = createSignal<AdminReservation | null>(null);
  const [rejectReason, setRejectReason] = createSignal("");
  const [rejectError, setRejectError] = createSignal("");
  const [rejectBusy, setRejectBusy] = createSignal(false);
  const [returnTarget, setReturnTarget] = createSignal<AdminReservation | null>(
    null,
  );

  const reload = async (quiet = false) => {
    setError("");
    if (!quiet) setLoading(true);
    try {
      const res = await api<{
        reservations: AdminReservation[];
        truncated?: boolean;
      }>("/api/admin/reservations");
      setReservations(res.reservations);
      setTruncated(res.truncated === true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "대여 목록을 불러오지 못했습니다",
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  onSettled(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (
      status &&
      ["pending", "reserved", "rented", "returned", "cancelled", "rejected", "overdue"].includes(status)
    ) {
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

  const openReturn = (reservation: AdminReservation) => {
    if (processingId() !== null) return;
    // 사진 첨부·반납은 모달이 맡는다 — 회원 사진과 관리자 확인 사진을 함께 남긴다.
    setReturnTarget(reservation);
  };

  const finishReturn = async (result: ReturnDialogResult) => {
    setReturnTarget(null);
    setMessage(result.message);
    setMessageTone(result.tone);
    await reload(true);
  };

  const openApprove = (reservation: AdminReservation) => {
    if (processingId() !== null) return;
    setApproveTarget(reservation);
    setApproveError("");
    const stored = reservation.due_at ? fmtKstDate(reservation.due_at) : "";
    setApproveDueDate(
      reservation.status === "reserved"
        ? defaultDueDateKst()
        : stored && isDueDateInRange(stored)
          ? stored
          : defaultDueDateKst(),
    );
  };

  const closeApprove = () => {
    if (approveBusy()) return;
    setApproveTarget(null);
  };

  const submitApprove = async () => {
    const target = approveTarget();
    if (!target || approveBusy()) return;
    if (!isDueDateInRange(approveDueDate())) {
      setApproveError("반납 예정일을 내일부터 30일 이내로 선택해 주세요.");
      return;
    }
    setApproveBusy(true);
    setApproveError("");
    setProcessingId(target.id);
    try {
      await api(`/api/admin/reservations/${target.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ due_date: approveDueDate() }),
      });
      setMessage("신청을 승인했습니다");
      setMessageTone("success");
      setApproveTarget(null);
      await reload(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setApproveError(
        code === "no_availability"
          ? "재고가 없어 승인할 수 없습니다. 반납 후 다시 시도해 주세요."
          : code === "due_date_required"
            ? "반납 예정일을 선택해 주세요."
            : code === "item_not_active" || code === "consumable"
              ? "지금은 대여할 수 없는 물품입니다."
              : code === "bad_status"
                ? "이미 처리된 신청입니다. 목록을 새로고침해 주세요."
                : err instanceof Error
                  ? err.message
                  : "승인에 실패했습니다",
      );
      await reload(true);
    } finally {
      setApproveBusy(false);
      setProcessingId(null);
    }
  };

  const openReject = (reservation: AdminReservation) => {
    setRejectTarget(reservation);
    setRejectReason("");
    setRejectError("");
  };

  const closeReject = () => {
    if (rejectBusy()) return;
    setRejectTarget(null);
  };

  const submitReject = async () => {
    const target = rejectTarget();
    if (!target || rejectBusy()) return;
    const reason = rejectReason().trim();
    if (!reason) {
      setRejectError("거절 사유를 입력해 주세요.");
      return;
    }
    setRejectBusy(true);
    setRejectError("");
    try {
      await api(`/api/admin/reservations/${target.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("신청을 거절했습니다");
      setMessageTone("success");
      setRejectTarget(null);
      await reload(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setRejectError(
        code === "bad_status"
          ? "이미 처리된 신청입니다. 목록을 새로고침해 주세요."
          : err instanceof Error
            ? err.message
            : "거절하지 못했습니다",
      );
      await reload(true);
    } finally {
      setRejectBusy(false);
    }
  };

  const contactLine = (reservation: AdminReservation) => {
    const phone = reservation.member_phone;
    const affiliation =
      reservation.member_affiliation_snapshot ?? reservation.member_affiliation;
    const contact = phone ? (
      <a class="text-ink-1 underline underline-offset-2" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
        {phone}
      </a>
    ) : (
      reservation.member_email || "연락처 미등록"
    );
    return (
      <span>
        {reservation.member_name || "—"}
        {affiliation ? ` · ${affiliation}` : ""} · {contact}
      </span>
    );
  };

  return (
    <AdminPage
      title="대여 관리"
      subtitle="신청을 승인·거절하고 대여·반납 상태를 확인합니다."
      loading={loading()}
      error={error()}
      message={message()}
      messageTone={messageTone()}
      onRetry={() => void reload()}
      loadingContent={
        <div class="mt-4">
          <ReservationListSkeleton />
        </div>
      }
      side
      sideContent={
        <section class="rounded-card border border-line bg-surface p-4">
          <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">반납 처리 안내</h2>
          <p class="mt-2 text-fine leading-normal text-ink-2">
            승인 대기·예약 대기 건은 <b class="font-semibold text-ink-1">승인</b> 또는{" "}
            <b class="font-semibold text-ink-1">거절</b>로 처리합니다. 예약은 반납 순서대로
            승인 후보가 되며, 승인할 때 반납 예정일을 정합니다. 승인 시점에 재고를 다시 확인하고,
            승인하면 대여가 시작됩니다. 물품을 돌려받았으면{" "}
            <b class="font-semibold text-ink-1">반납</b>을 눌러 주세요. 반납할 때 회수 확인 사진을
            남길 수 있고, 회원이 직접 반납한 건은 목록에서 따로 표시됩니다. 반납 예정일이 지난 건은{" "}
            <b class="font-semibold text-ink-1">기한 지남</b> 필터로 볼 수 있습니다.
          </p>
        </section>
      }
      toolbar={
        <Chip
          ariaLabel="상태 필터"
          value={filter()}
          options={[
            { value: "", label: "전체" },
            { value: "pending", label: "승인 대기" },
            { value: "reserved", label: "예약 대기" },
            { value: "rented", label: "대여 중" },
            { value: "overdue", label: "기한 지남" },
            { value: "returned", label: "반납 완료" },
            { value: "cancelled", label: "취소" },
            { value: "rejected", label: "거절" },
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
              text={filter() ? "해당 상태의 대여가 없습니다" : "대여가 없습니다"}
              subtitle={filter() ? "다른 상태를 선택해 보세요." : ""}
            />
          </div>
        }
      >
        <Show when={truncated()}>
          <p class="mt-4 text-fine leading-normal text-ink-2" role="status">
            500건까지만 표시 — 더 오래된 건은 여기 없습니다
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
                  active={
                    reservation.status === "pending" ||
                    reservation.status === "reserved"
                  }
                  inlineActions
                  actions={
                    <>
                      <Show
                        when={
                          reservation.status === "pending" ||
                          reservation.status === "reserved"
                        }
                      >
                        <Button
                          variant="primary"
                          loading={processing()}
                          disabled={
                            (processingId() !== null && !processing()) ||
                            (reservation.status === "reserved" &&
                              !reservation.approvable)
                          }
                          onClick={() => openApprove(reservation)}
                        >
                          승인
                        </Button>
                        <Button
                          variant="danger"
                          disabled={processingId() !== null && !processing()}
                          onClick={() => openReject(reservation)}
                        >
                          거절
                        </Button>
                      </Show>
                      <Show when={reservation.status === "rented"}>
                        <Button
                          variant="secondary"
                          disabled={processingId() !== null}
                          onClick={() => openReturn(reservation)}
                        >
                          반납
                        </Button>
                      </Show>
                    </>
                  }
                >
                  {contactLine(reservation)}
                  <Show
                    when={
                      reservation.status === "pending" ||
                      reservation.status === "reserved"
                    }
                  >
                    <span>
                      재고 {reservation.item_rentable_qty} · 대여 중{" "}
                      {reservation.item_rented_qty} · 승인 대기{" "}
                      {reservation.item_pending_qty} · 예약 대기{" "}
                      {reservation.item_reserved_qty}
                    </span>
                    <Show when={reservation.status === "reserved"}>
                      <span class={reservation.approvable ? "" : "text-danger"}>
                        앞에 {reservation.queue_ahead_qty ?? 0}개 대기 ·{" "}
                        {reservation.approvable
                          ? "지금 승인 가능"
                          : "재고가 없어 승인할 수 없습니다"}
                      </span>
                    </Show>
                  </Show>
                  <span>
                    {fmtKstDate(reservation.created_at)}{" "}
                    {reservation.status === "reserved" ? "예약" : "대여"}
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
                      {reservation.is_overdue ? " · 기한이 지났습니다" : ""}
                    </span>
                  </Show>
                  <Show when={reservation.status === "rejected" && reservation.rejected_reason}>
                    <span class="text-danger">
                      거절 사유: {reservation.rejected_reason}
                    </span>
                  </Show>
                  <Show when={reservation.decided_by_name}>
                    <span class={reservation.status === "rejected" ? "text-danger" : ""}>
                      {reservation.status === "rejected" ? "거절" : "승인"}:{" "}
                      {reservation.decided_by_name}
                      {reservation.decided_at
                        ? ` · ${fmtKstDate(reservation.decided_at)}`
                        : ""}
                    </span>
                  </Show>
                  <Show when={reservation.returned_by_member}>
                    <span class="text-fine text-danger">
                      회원이 직접 반납했습니다 — 물품 회수 여부를 확인해 주세요
                    </span>
                  </Show>
                  <Show when={reservation.member_memo}>
                    <span>메모 · {reservation.member_memo}</span>
                  </Show>
                  <Show when={reservation.return_photos.length > 0}>
                    <ReturnPhotoStrip
                      photos={reservation.return_photos}
                      showRole
                    />
                  </Show>
                </ReservationRow>
              );
            }}
          </For>
        </div>
      </Show>

      <ReturnDialog
        open={returnTarget() !== null}
        reservation={returnTarget()}
        mode="admin"
        onClose={() => setReturnTarget(null)}
        onFinished={(result) => void finishReturn(result)}
      />

      <Modal
        open={approveTarget() !== null}
        title={
          approveTarget()?.status === "reserved"
            ? "예약 승인"
            : "대여 신청 승인"
        }
        maxWidth="420px"
        onClose={closeApprove}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeApprove}
              disabled={approveBusy()}
            >
              닫기
            </Button>
            <Button
              variant="primary"
              loading={approveBusy()}
              onClick={() => void submitApprove()}
            >
              승인
            </Button>
          </>
        }
      >
        <p class="m-0 text-fine leading-normal text-ink-2">
          '{approveTarget()?.item_name ?? "물품"}' {approveTarget()?.qty ?? 1}개를
          승인합니다. 재고는 승인 시점에 다시 확인합니다.
        </p>
        <Show when={approveTarget()?.status === "reserved"}>
          <p class="mt-2 m-0 text-fine leading-normal text-ink-2">
            예약 건입니다. 반납 순서에 따라 승인하고, 아래에서 반납 예정일을 정해
            주세요.
          </p>
        </Show>
        <Input
          class="mt-4"
          label="반납 예정일 *"
          type="date"
          min={minDueDateKst()}
          max={maxDueDateKst()}
          value={approveDueDate()}
          onInput={setApproveDueDate}
          required
        />
        <p class="mt-2 text-fine leading-normal text-ink-2">
          내일부터 30일 이내로 선택해 주세요.
        </p>
        <Show when={approveError()}>
          <p class="mt-2 m-0 text-fine leading-normal text-danger" role="alert">
            {approveError()}
          </p>
        </Show>
      </Modal>

      <Modal
        open={rejectTarget() !== null}
        title="대여 신청 거절"
        maxWidth="420px"
        onClose={closeReject}
        footer={
          <>
            <Button variant="secondary" onClick={closeReject} disabled={rejectBusy()}>
              닫기
            </Button>
            <Button
              variant="danger-solid"
              loading={rejectBusy()}
              onClick={() => void submitReject()}
            >
              거절
            </Button>
          </>
        }
      >
        <p class="m-0 text-fine leading-normal text-ink-2">
          '{rejectTarget()?.item_name ?? "물품"}' 신청을 거절합니다. 사유는 회원의 대여
          이력에 남습니다.
        </p>
        <Input
          class="mt-4"
          label="거절 사유 *"
          type="textarea"
          rows={3}
          placeholder="예: 해당 기간에 이미 대여가 잡혀 있습니다"
          value={rejectReason()}
          onInput={setRejectReason}
        />
        <Show when={rejectError()}>
          <p class="mt-2 m-0 text-fine leading-normal text-danger" role="alert">
            {rejectError()}
          </p>
        </Show>
      </Modal>
    </AdminPage>
  );
}
