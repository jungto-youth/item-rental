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
    <div
      class={`reservation-row ${props.active ? "active" : ""} ${
        props.inlineActions ? "inline-actions" : ""
      }`}
    >
      <div class="card">
        <div class="row">
          <span class="title">{props.title}</span>
          <Show when={props.badgeKind}>
            <Badge kind={props.badgeKind} />
          </Show>
          <Show when={props.actions}>
            <span class="actions">{props.actions}</span>
          </Show>
        </div>
        <Show when={props.children}>
          <div class="lines">{props.children}</div>
        </Show>
      </div>
    </div>
  );
}
