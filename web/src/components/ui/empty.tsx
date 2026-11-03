import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { AlertIcon, BoxIcon } from "../icons";

type Props = {
  state?: "loading" | "empty" | "error";
  text?: string;
  subtitle?: string;
  compact?: boolean;
  children?: JSX.Element;
};

export function Empty(props: Props) {
  const state = () => props.state ?? "empty";
  const text = () =>
    props.text ||
    (state() === "loading"
      ? "불러오는 중…"
      : state() === "error"
        ? "오류가 발생했어요"
        : "내용이 없어요");

  const boxClass = () => {
    if (props.compact) return "block border-0 bg-transparent p-0 text-left";
    if (state() === "loading")
      return "flex flex-col items-center justify-center border-0 bg-transparent px-4 py-8 text-center";
    return "flex flex-col items-center justify-center rounded-card border border-line bg-surface px-6 py-10 text-center";
  };

  const stateClass = () => {
    if (props.compact)
      return `inline-flex items-center justify-center gap-2 text-fine font-normal leading-normal ${
        state() === "error" ? "text-danger" : "text-ink-2"
      }`;
    if (state() === "loading")
      return "inline-flex items-center justify-center gap-2 text-body font-normal leading-normal text-ink-2";
    return "inline-flex items-center justify-center gap-2 text-body font-semibold leading-normal text-ink-1";
  };

  return (
    <div class="block">
      <div
        class={boxClass()}
        role={state() === "error" ? "alert" : "status"}
      >
        <Show
          when={state() === "loading"}
          fallback={
            <>
              <span
                class={`${props.compact ? "hidden" : "flex"} size-12 items-center justify-center rounded-pill ${
                  state() === "error"
                    ? "bg-danger-soft text-danger"
                    : "bg-surface-muted text-ink-3"
                }`}
                aria-hidden="true"
              >
                <Show when={state() === "error"} fallback={<BoxIcon />}>
                  <AlertIcon />
                </Show>
              </span>
              <p
                class={`${props.compact ? "m-0" : "mt-4"} ${stateClass()}`}
              >
                {text()}
              </p>
              <Show when={props.subtitle}>
                <p class="mt-2 max-w-[320px] text-fine leading-normal text-ink-2">
                  {props.subtitle}
                </p>
              </Show>
            </>
          }
        >
          <div class={`m-0 ${stateClass()}`}>
            <span
              class="size-3.5 shrink-0 animate-[spin_0.6s_linear_infinite] rounded-full border-2 border-ink-2 border-r-transparent"
              aria-hidden="true"
            />
            <span>{text()}</span>
          </div>
        </Show>
        <Show when={props.children}>
          <div
            class={`flex flex-wrap justify-center gap-2 ${
              props.compact ? "mt-2" : "mt-4"
            }`}
          >
            {props.children}
          </div>
        </Show>
      </div>
    </div>
  );
}
