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
import { Checkbox } from "../../components/ui/checkbox";
import { Chip } from "../../components/ui/chip";
import { Empty } from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { Modal } from "../../components/ui/modal";
import { ReservationRow, ReservationListSkeleton } from "../../components/common/reservation-row";
import { ReturnDialog, type ReturnDialogResult } from "../../components/features/rental/return-dialog";
import { ReturnPhotoStrip } from "../../components/features/rental/return-photo-strip";

type Filter = "" | ReservationStatus | "overdue";

// 서버의 일괄 라우트와 같은 상한 — 넘으면 화면에서 먼저 막는다.
const BULK_LIMIT = 50;

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
  // 일괄 처리 — 선택한 승인 대기·예약 대기 행을 한 번에 승인하거나 거절한다.
  const [selected, setSelected] = createSignal<ReadonlySet<number>>(new Set());
  const [batchOpen, setBatchOpen] = createSignal(false);
  const [batchDueDate, setBatchDueDate] = createSignal(defaultDueDateKst());
  const [batchError, setBatchError] = createSignal("");
  const [batchBusy, setBatchBusy] = createSignal(false);
  // 일괄 거절 — 선택한 행에 같은 사유를 적용한다.
  const [batchRejectOpen, setBatchRejectOpen] = createSignal(false);
  const [batchRejectReason, setBatchRejectReason] = createSignal("");
  const [batchRejectError, setBatchRejectError] = createSignal("");
  const [batchRejectBusy, setBatchRejectBusy] = createSignal(false);
  const [rejectTarget, setRejectTarget] = createSignal<AdminReservation | null>(null);
  const [rejectReason, setRejectReason] = createSignal("");
  const [rejectError, setRejectError] = createSignal("");
  const [rejectBusy, setRejectBusy] = createSignal(false);
  const [returnTarget, setReturnTarget] = createSignal<AdminReservation | null>(
    null,
  );

  // 단건 승인·일괄 승인·일괄 거절이 겹치지 않게 한 잠금으로 묶는다.
  const busy = () => processingId() !== null || batchBusy() || batchRejectBusy();

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
      // 사라진 행의 선택만 지운다 — 일괄 처리에서 실패한 행은 선택된 채로 남겨
      // 사유를 확인하고 바로 다시 시도할 수 있게 한다.
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const live = new Set(res.reservations.map((reservation) => reservation.id));
        const next = new Set([...prev].filter((id) => live.has(id)));
        return next.size === prev.size ? prev : next;
      });
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
    // 필터가 바뀌면 보이지 않는 행이 선택된 채로 남지 않게 비운다.
    setSelected(new Set<number>());
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

  // 선택 대상 — 승인 대기와 예약 대기. 예약은 재고가 없어도 거절은 할 수 있으므로
  // 승인 가능 여부와 무관하게 고를 수 있게 하고, 승인 요청에서만 걸러낸다.
  const selectableRows = createMemo(() =>
    filtered().filter(
      (reservation) =>
        reservation.status === "pending" || reservation.status === "reserved",
    ),
  );
  const isSelectable = (reservation: AdminReservation) =>
    reservation.status === "pending" || reservation.status === "reserved";

  const isApprovable = (reservation: AdminReservation) =>
    reservation.status === "pending" ||
    (reservation.status === "reserved" && reservation.approvable);

  const selectedRows = createMemo(() =>
    selectableRows().filter((reservation) => selected().has(reservation.id)),
  );

  const approvableSelected = createMemo(() =>
    selectedRows().filter(isApprovable),
  );

  const allSelected = () => {
    const rows = selectableRows();
    return rows.length > 0 && rows.every((row) => selected().has(row.id));
  };

  const someSelected = () => selectedRows().length > 0 && !allSelected();

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelected = () => {
    if (allSelected()) {
      setSelected(new Set<number>());
      return;
    }
    setSelected(new Set(selectableRows().map((row) => row.id)));
  };

  const clearSelected = () => setSelected(new Set<number>());

  const removeSelected = (ids: number[]) => {
    if (ids.length === 0) return;
    const remove = new Set(ids);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => !remove.has(id)));
      return next.size === prev.size ? prev : next;
    });
  };

  const approveOverLimit = () => approvableSelected().length > BULK_LIMIT;
  const rejectOverLimit = () => selectedRows().length > BULK_LIMIT;

  const openBatchApprove = () => {
    if (busy() || approvableSelected().length === 0) return;
    const first = approvableSelected()[0];
    const stored = first?.due_at ? fmtKstDate(first.due_at) : "";
    setBatchDueDate(
      first?.status === "reserved"
        ? defaultDueDateKst()
        : stored && isDueDateInRange(stored)
          ? stored
          : defaultDueDateKst(),
    );
    setBatchError("");
    setBatchOpen(true);
  };

  const closeBatchApprove = () => {
    if (batchBusy()) return;
    setBatchOpen(false);
  };

  const submitBatchApprove = async () => {
    const ids = approvableSelected().map((reservation) => reservation.id);
    if (ids.length === 0 || batchBusy()) return;
    if (ids.length > BULK_LIMIT) {
      setBatchError(`한 번에 최대 ${BULK_LIMIT}건까지 승인할 수 있습니다.`);
      return;
    }
    if (!isDueDateInRange(batchDueDate())) {
      setBatchError("반납 예정일을 내일부터 30일 이내로 선택해 주세요.");
      return;
    }
    setBatchBusy(true);
    setBatchError("");
    try {
      const result = await api<{
        approved: number[];
        failed: { id: number; error: string }[];
      }>("/api/admin/reservations/approve", {
        method: "POST",
        body: JSON.stringify({ ids, due_date: batchDueDate() }),
      });
      const failed = result.failed.length;
      setMessage(
        failed > 0
          ? `${result.approved.length}건을 승인했고 ${failed}건은 처리하지 못했습니다`
          : `${result.approved.length}건을 승인했습니다`,
      );
      setMessageTone(failed > 0 ? "info" : "success");
      // 성공한 행만 선택에서 뺀다 — 실패한 행은 남겨 바로 다시 시도할 수 있게.
      removeSelected(result.approved);
      setBatchOpen(false);
      await reload(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setBatchError(
        code === "due_date_required"
          ? "반납 예정일을 선택해 주세요."
          : code === "too_many_ids"
            ? `한 번에 최대 ${BULK_LIMIT}건까지 승인할 수 있습니다.`
            : code === "ids_required"
              ? "승인할 신청을 선택해 주세요."
              : code === "bad_status"
                ? "이미 처리된 신청이 섞여 있습니다. 목록을 새로고침한 뒤 다시 선택해 주세요."
                : err instanceof Error
                  ? err.message
                  : "일괄 승인에 실패했습니다",
      );
      await reload(true);
    } finally {
      setBatchBusy(false);
    }
  };

  const openBatchReject = () => {
    if (busy() || selectedRows().length === 0) return;
    if (rejectOverLimit()) return;
    setBatchRejectReason("");
    setBatchRejectError("");
    setBatchRejectOpen(true);
  };

  const closeBatchReject = () => {
    if (batchRejectBusy()) return;
    setBatchRejectOpen(false);
  };

  const submitBatchReject = async () => {
    const ids = selectedRows().map((reservation) => reservation.id);
    if (ids.length === 0 || batchRejectBusy()) return;
    if (ids.length > BULK_LIMIT) {
      setBatchRejectError(`한 번에 최대 ${BULK_LIMIT}건까지 거절할 수 있습니다.`);
      return;
    }
    const reason = batchRejectReason().trim();
    if (!reason) {
      setBatchRejectError("거절 사유를 입력해 주세요.");
      return;
    }
    setBatchRejectBusy(true);
    setBatchRejectError("");
    try {
      const result = await api<{
        rejected: number[];
        failed: { id: number; error: string }[];
      }>("/api/admin/reservations/reject", {
        method: "POST",
        body: JSON.stringify({ ids, reason }),
      });
      const failed = result.failed.length;
      setMessage(
        failed > 0
          ? `${result.rejected.length}건을 거절했고 ${failed}건은 처리하지 못했습니다`
          : `${result.rejected.length}건을 거절했습니다`,
      );
      setMessageTone(
        failed > 0 ? (result.rejected.length > 0 ? "info" : "error") : "success",
      );
      // 성공한 행만 선택에서 뺀다 — 실패한 행은 남겨 바로 다시 시도할 수 있게.
      removeSelected(result.rejected);
      setBatchRejectOpen(false);
      await reload(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setBatchRejectError(
        code === "reason_required"
          ? "거절 사유를 입력해 주세요."
          : code === "too_many_ids"
            ? `한 번에 최대 ${BULK_LIMIT}건까지 거절할 수 있습니다.`
            : code === "ids_required"
              ? "거절할 신청을 선택해 주세요."
              : code === "bad_status"
                ? "이미 처리된 신청이 섞여 있습니다. 목록을 새로고침한 뒤 다시 선택해 주세요."
                : err instanceof Error
                  ? err.message
                  : "일괄 거절에 실패했습니다",
      );
      await reload(true);
    } finally {
      setBatchRejectBusy(false);
    }
  };

  const openReturn = (reservation: AdminReservation) => {
    if (busy()) return;
    // 사진 첨부·반납은 모달이 맡는다 — 회원 사진과 관리자 확인 사진을 함께 남긴다.
    setReturnTarget(reservation);
  };

  const finishReturn = async (result: ReturnDialogResult) => {
    const target = returnTarget();
    if (target) removeSelected([target.id]);
    setReturnTarget(null);
    setMessage(result.message);
    setMessageTone(result.tone);
    await reload(true);
  };

  const openApprove = (reservation: AdminReservation) => {
    if (busy()) return;
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
      removeSelected([target.id]);
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
    if (busy()) return;
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
      removeSelected([target.id]);
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
        <Show when={selectableRows().length > 0}>
          <div class="mt-4 rounded-card border border-line bg-surface-muted px-4 py-3">
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex cursor-pointer items-center gap-2 text-fine text-ink-1">
                <Checkbox
                  label="현재 목록의 대여 전체 선택"
                  checked={allSelected()}
                  indeterminate={someSelected()}
                  onChange={toggleAllSelected}
                />
                전체 선택
              </label>
              <span class="text-fine text-ink-2">
                {selectedRows().length > 0
                  ? `${selectedRows().length}건 선택`
                  : "승인·거절할 신청을 선택하세요"}
              </span>
              <span class="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={selectedRows().length === 0}
                  onClick={clearSelected}
                >
                  선택 해제
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    approvableSelected().length === 0 || approveOverLimit()
                  }
                  onClick={openBatchApprove}
                >
                  선택 승인
                  {approvableSelected().length > 0
                    ? ` (${approvableSelected().length})`
                    : ""}
                </Button>
                <Button
                  variant="danger"
                  disabled={selectedRows().length === 0 || rejectOverLimit()}
                  onClick={openBatchReject}
                >
                  선택 거절
                  {selectedRows().length > 0 ? ` (${selectedRows().length})` : ""}
                </Button>
              </span>
            </div>
            <Show when={approveOverLimit() || rejectOverLimit()}>
              <p class="mt-2 mb-0 text-fine text-ink-2" role="status">
                한 번에 최대 {BULK_LIMIT}건까지 처리할 수 있습니다. 선택을 줄여
                주세요.
              </p>
            </Show>
          </div>
        </Show>
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
                  leading={
                    isSelectable(reservation) ? (
                      <Checkbox
                        label={`${reservation.item_name} 선택`}
                        checked={selected().has(reservation.id)}
                        onChange={() => toggleSelected(reservation.id)}
                      />
                    ) : undefined
                  }
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
                            busy() ||
                            (reservation.status === "reserved" &&
                              !reservation.approvable)
                          }
                          onClick={() => openApprove(reservation)}
                        >
                          승인
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy()}
                          onClick={() => openReject(reservation)}
                        >
                          거절
                        </Button>
                      </Show>
                      <Show when={reservation.status === "rented"}>
                        <Button
                          variant="secondary"
                          disabled={busy()}
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
                  <Show when={reservation.return_note}>
                    <span>반납 특이사항 · {reservation.return_note}</span>
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
        open={batchOpen()}
        title="선택한 신청 일괄 승인"
        maxWidth="420px"
        onClose={closeBatchApprove}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeBatchApprove}
              disabled={batchBusy()}
            >
              닫기
            </Button>
            <Button
              variant="primary"
              loading={batchBusy()}
              onClick={() => void submitBatchApprove()}
            >
              {approvableSelected().length}건 승인
            </Button>
          </>
        }
      >
        <p class="m-0 text-fine leading-normal text-ink-2">
          선택한 {approvableSelected().length}건을 같은 반납 예정일로 승인합니다.
          건별 재고는 승인 시점에 다시 확인하며, 처리하지 못한 건은 선택된 채로
          남습니다.
        </p>
        <ul class="mt-3 mb-0 grid gap-1 pl-4 text-fine leading-normal text-ink-2">
          <For each={approvableSelected().slice(0, 8)}>
            {(reservation) => (
              <li class="list-disc">
                {reservation.item_name} · {reservation.qty}개
                <Show when={reservation.member_name}>
                  {" "}
                  · {reservation.member_name}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={approvableSelected().length > 8}>
          <p class="mt-1 mb-0 text-fine leading-normal text-ink-2">
            외 {approvableSelected().length - 8}건
          </p>
        </Show>
        <Input
          class="mt-4"
          label="반납 예정일 *"
          type="date"
          min={minDueDateKst()}
          max={maxDueDateKst()}
          value={batchDueDate()}
          onInput={setBatchDueDate}
          required
        />
        <p class="mt-2 text-fine leading-normal text-ink-2">
          내일부터 30일 이내로 선택해 주세요.
        </p>
        <Show when={batchError()}>
          <p class="mt-2 m-0 text-fine leading-normal text-danger" role="alert">
            {batchError()}
          </p>
        </Show>
      </Modal>

      <Modal
        open={batchRejectOpen()}
        title="선택한 신청 일괄 거절"
        maxWidth="420px"
        onClose={closeBatchReject}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeBatchReject}
              disabled={batchRejectBusy()}
            >
              닫기
            </Button>
            <Button
              variant="danger-solid"
              loading={batchRejectBusy()}
              onClick={() => void submitBatchReject()}
            >
              {selectedRows().length}건 거절
            </Button>
          </>
        }
      >
        <p class="m-0 text-fine leading-normal text-ink-2">
          선택한 {selectedRows().length}건에 같은 사유를 남겨 거절합니다. 사유는 각
          회원의 대여 이력에 남습니다.
        </p>
        <ul class="mt-3 mb-0 grid gap-1 pl-4 text-fine leading-normal text-ink-2">
          <For each={selectedRows().slice(0, 8)}>
            {(reservation) => (
              <li class="list-disc">
                {reservation.item_name} · {reservation.qty}개
                <Show when={reservation.member_name}>
                  {" "}
                  · {reservation.member_name}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={selectedRows().length > 8}>
          <p class="mt-1 mb-0 text-fine leading-normal text-ink-2">
            외 {selectedRows().length - 8}건
          </p>
        </Show>
        <Input
          class="mt-4"
          label="거절 사유 *"
          type="textarea"
          rows={3}
          placeholder="예: 해당 기간에 이미 대여가 잡혀 있습니다"
          value={batchRejectReason()}
          onInput={setBatchRejectReason}
        />
        <Show when={batchRejectError()}>
          <p class="mt-2 m-0 text-fine leading-normal text-danger" role="alert">
            {batchRejectError()}
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
