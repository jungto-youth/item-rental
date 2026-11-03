import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  action?: JSX.Element;
}) {
  return (
    <div class="mb-6 block">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="m-0 text-page-title font-bold tracking-tight text-ink-1">
            {props.title}
          </h1>
          <Show when={props.subtitle}>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              {props.subtitle}
            </p>
          </Show>
        </div>
        <Show when={props.action}>
          <div class="flex shrink-0 items-center gap-2">{props.action}</div>
        </Show>
      </div>
    </div>
  );
}
