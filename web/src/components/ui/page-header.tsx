import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  action?: JSX.Element;
}) {
  return (
    <div class="x-page-header">
      <div class="row">
        <div>
          <h1>{props.title}</h1>
          <Show when={props.subtitle}>
            <p class="subtitle">{props.subtitle}</p>
          </Show>
        </div>
        <Show when={props.action}>
          <div class="action">{props.action}</div>
        </Show>
      </div>
    </div>
  );
}
