import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

type Props = {
  tone?: "info" | "danger";
  alert?: boolean;
  action?: JSX.Element;
  children?: JSX.Element;
};

export function Notice(props: Props) {
  const tone = () => props.tone ?? "info";
  return (
    <div class="block">
      <div
        class={`flex items-center justify-between gap-4 rounded-card border p-4 text-fine leading-normal ${
          tone() === "danger"
            ? "border-danger bg-danger-soft text-danger"
            : "border-line bg-surface text-ink-1"
        }`}
        role={props.alert ? "alert" : "status"}
      >
        <span class="min-w-0 [&_a]:text-primary-strong">{props.children}</span>
        <Show when={props.action}>
          <span class="shrink-0">{props.action}</span>
        </Show>
      </div>
    </div>
  );
}
