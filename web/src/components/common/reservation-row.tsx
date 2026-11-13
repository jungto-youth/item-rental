import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";

type Props = {
  title: string;
  badgeKind?: string;
  active?: boolean;
  inlineActions?: boolean;
  /** 제목 앞에 붙는 요소 — 관리자 목록의 선택 체크박스 등 */
  leading?: JSX.Element;
  actions?: JSX.Element;
  children?: JSX.Element;
};

export function ReservationRow(props: Props) {
  return (
    <div class="reservation-row block min-w-0">
      <div
        class={`box-border rounded-card border bg-surface p-4 ${
          props.active ? "border-ink-1" : "border-line"
        }`}
      >
        <div
          class={`flex items-center gap-3 ${
            props.inlineActions ? "max-sm:flex-nowrap" : "max-sm:flex-wrap"
          }`}
        >
          <Show when={props.leading}>
            <span class="flex shrink-0 items-center">{props.leading}</span>
          </Show>
          <span class="min-w-0 truncate text-body font-semibold tracking-tight">
            {props.title}
          </span>
          <Show when={props.badgeKind}>
            <Badge kind={props.badgeKind} />
          </Show>
          <Show when={props.actions}>
            <span
              class={`ml-auto flex shrink-0 items-center gap-2 ${
                props.inlineActions
                  ? "max-sm:w-auto max-sm:[&>span]:flex-none"
                  : "max-sm:w-full max-sm:[&>span]:flex-1"
              }`}
            >
              {props.actions}
            </span>
          </Show>
        </div>
        <Show when={props.children}>
          <div class="mt-2 grid gap-1 text-fine text-ink-2 [overflow-wrap:anywhere] [&>*]:m-0">
            {props.children}
          </div>
        </Show>
      </div>
    </div>
  );
}

// 목록 초기 로드용 — 실제 행과 같은 높이·간격을 유지해 내용이 들어올 때 덜 튄다
export function ReservationListSkeleton(props: { label?: string; rows?: number }) {
  return (
    <div
      class="grid gap-2"
      role="status"
      aria-label={props.label ?? "대여 목록을 불러오는 중"}
    >
      <For each={Array.from({ length: props.rows ?? 4 })}>
        {() => (
          <div class="reservation-row block min-w-0" aria-hidden="true">
            <div class="box-border rounded-card border border-line bg-surface p-4">
              <div class="flex items-center gap-3 max-sm:flex-nowrap">
                <Skeleton class="h-4 w-2/5 rounded" />
                <Skeleton tone="muted" class="h-6 w-16 shrink-0 rounded-pill" />
                <Skeleton
                  tone="muted"
                  class="ml-auto h-9 w-14 shrink-0 rounded-card"
                />
              </div>
              <div class="mt-2 grid gap-1">
                <Skeleton class="h-3.5 w-3/5 rounded" />
                <Skeleton class="h-3.5 w-2/5 rounded" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
