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
    <div class="x-notice">
      <div
        class={`notice ${tone()}`}
        role={props.alert ? "alert" : "status"}
      >
        <span class="body">{props.children}</span>
        <Show when={props.action}>
          <span class="action">{props.action}</span>
        </Show>
      </div>
    </div>
  );
}
