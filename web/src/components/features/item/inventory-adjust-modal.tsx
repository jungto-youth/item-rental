import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { api, ApiError } from "../../../api/client";
import { fmtKstDate } from "../../../utils/date";
import type {
  AdminInventoryAdjustment,
  InventoryAdjustmentKind,
} from "../../../types";
import { Modal } from "../../ui/modal";
import { Button } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { Input } from "../../ui/input";

// 재고 수량 조정 — 물품 상세에서 여는 관리자 동작.
// 수정 폼과 분리해 두어 "물품 정보 저장"과 "수량 변경 이력"이 섞이지 않게 한다.
const ADJUSTMENT_LABELS: Record<InventoryAdjustmentKind, string> = {
  add: "추가",
  lost: "망실",
  dispose: "폐기",
};

const ADJUSTMENT_OPTIONS = [
  { value: "add", label: "추가" },
  { value: "lost", label: "망실" },
  { value: "dispose", label: "폐기" },
];

type Props = {
  itemId: number | string;
  itemName: string;
  /** 모달을 열 때의 보유 수량 — 조정 성공 후에는 응답 값으로 갱신한다 */
  totalQty: number;
  open: boolean;
  onClose: () => void;
  onAdjusted: (totalQty: number) => void;
};

export function InventoryAdjustModal(props: Props) {
  const [kind, setKind] = createSignal<InventoryAdjustmentKind>("add");
  const [qty, setQty] = createSignal("1");
  const [memo, setMemo] = createSignal("");
  const [currentQty, setCurrentQty] = createSignal(props.totalQty);
  const [adjusting, setAdjusting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [adjustments, setAdjustments] = createSignal<AdminInventoryAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = createSignal(true);

  let loadGen = 0;

  const loadAdjustments = async () => {
    const gen = ++loadGen;
    setHistoryLoading(true);
    try {
      const res = await api<{ adjustments: AdminInventoryAdjustment[] }>(
        `/api/admin/items/${props.itemId}/adjustments`,
      );
      if (gen === loadGen) setAdjustments(res.adjustments);
    } catch {
      if (gen === loadGen) setAdjustments([]);
    } finally {
      if (gen === loadGen) setHistoryLoading(false);
    }
  };

  // 열릴 때마다 입력을 초기화하고 최신 이력을 다시 읽는다.
  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      setKind("add");
      setQty("1");
      setMemo("");
      setError("");
      setMessage("");
      untrack(() => setCurrentQty(props.totalQty));
      void loadAdjustments();
    },
  );

  onCleanup(() => {
    loadGen++;
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (adjusting()) return;

    const parsed = Number(qty());
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("수량을 1 이상 입력해 주세요.");
      setMessage("");
      return;
    }

    setAdjusting(true);
    setError("");
    setMessage("");
    try {
      const res = await api<{ ok: true; total_qty: number }>(
        `/api/admin/items/${props.itemId}/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: kind(),
            qty: parsed,
            memo: memo().trim() || undefined,
          }),
        },
      );
      setCurrentQty(res.total_qty);
      setQty("1");
      setMemo("");
      setMessage(
        `${ADJUSTMENT_LABELS[kind()]} ${parsed}개를 반영했어요. 현재 보유 ${res.total_qty}개`,
      );
      props.onAdjusted(res.total_qty);
      await loadAdjustments();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "rented_qty_constraint") {
        setError("대여 중인 수량보다 적게 줄일 수 없어요.");
      } else if (code === "repair_qty_constraint") {
        setError("수리 중 수량보다 적게 줄일 수 없어요.");
      } else if (code === "min_qty") {
        setError(
          "보유 수량은 1개 이상이어야 해요. 물품을 폐기하려면 상태를 폐기로 바꿔 주세요.",
        );
      } else if (code === "conflict") {
        setError("다른 변경이 있었어요. 새로고침 후 다시 시도해 주세요.");
      } else {
        setError(
          err instanceof Error ? err.message : "수량을 조정하지 못했어요.",
        );
      }
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <Modal
      open={props.open}
      title="수량 조정"
      onClose={props.onClose}
      footer={
        <Button variant="secondary" type="button" onClick={props.onClose}>
          닫기
        </Button>
      }
    >
      <div class="flex flex-col gap-4">
        <p class="m-0 text-body leading-normal text-ink-2">
          <b class="font-semibold text-ink-1">{props.itemName}</b> · 현재 보유{" "}
          {currentQty()}개
        </p>

        <form class="flex flex-col gap-4" onSubmit={submit}>
          <span class="flex flex-col gap-2 text-fine font-normal text-ink-2">
            구분
            <Chip
              ariaLabel="수량 조정 구분"
              value={kind()}
              options={ADJUSTMENT_OPTIONS}
              onChange={(value) =>
                setKind(value as InventoryAdjustmentKind)
              }
            />
          </span>
          <Input
            label="수량 *"
            type="number"
            inputmode="numeric"
            min="1"
            value={qty()}
            onInput={setQty}
          />
          <Input
            label="사유 메모 (선택)"
            placeholder="예: 신규 구입, 파손 폐기"
            value={memo()}
            onInput={setMemo}
          />

          <Show when={error()}>
            <p class="m-0 text-fine leading-normal text-danger" role="alert">
              {error()}
            </p>
          </Show>
          <Show when={message()}>
            <p class="m-0 text-fine leading-normal text-ink-2" role="status">
              {message()}
            </p>
          </Show>

          <div class="flex justify-end">
            <Button variant="primary" type="submit" loading={adjusting()}>
              수량 조정
            </Button>
          </div>
        </form>

        <div class="border-t border-line pt-4">
          <h3 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
            최근 조정 이력
          </h3>
          <Show
            when={!historyLoading()}
            fallback={
              <p class="mt-2 m-0 text-fine text-ink-2" role="status">
                조정 이력을 불러오는 중…
              </p>
            }
          >
            <Show
              when={adjustments().length > 0}
              fallback={
                <p class="mt-2 m-0 text-fine text-ink-2">
                  아직 조정 이력이 없어요.
                </p>
              }
            >
              <ul class="mt-4 m-0 grid list-none gap-2 p-0">
                <For each={adjustments()}>
                  {(entry) => (
                    <li class="box-border rounded-card border border-line bg-surface-muted px-4 py-2 text-fine leading-normal text-ink-2">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-semibold text-ink-1">
                          {ADJUSTMENT_LABELS[entry.kind]} {entry.qty}개
                        </span>
                        <span>{fmtKstDate(entry.created_at)}</span>
                      </div>
                      <p class="m-0 mt-2">
                        보유 {entry.total_qty_before} → {entry.total_qty_after}
                        {entry.actor_name ? ` · ${entry.actor_name}` : ""}
                      </p>
                      <Show when={entry.memo}>
                        <p class="m-0 mt-2">사유: {entry.memo}</p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </div>
    </Modal>
  );
}
