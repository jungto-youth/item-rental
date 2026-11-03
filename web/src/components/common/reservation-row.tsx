import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Badge } from "../ui/badge";

type Props = {
  title: string;
  badgeKind?: string;
  active?: boolean;
  inlineActions?: boolean;
  actions?: JSX.Element;
  children?: JSX.Element;
};

export function ReservationRow(props: Props) {
  return (
    <div class="reservation-row block">
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
