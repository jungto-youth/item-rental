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

  return (
    <div class={`x-empty ${props.compact ? "compact" : ""}`}>
      <div
        class={`box ${state()}`}
        role={state() === "error" ? "alert" : "status"}
      >
        <Show
          when={state() === "loading"}
          fallback={
            <>
              <span class="icon" aria-hidden="true">
                <Show when={state() === "error"} fallback={<BoxIcon />}>
                  <AlertIcon />
                </Show>
              </span>
              <p class="state title">{text()}</p>
              <Show when={props.subtitle}>
                <p class="subtitle">{props.subtitle}</p>
              </Show>
            </>
          }
        >
          <div class="state loading">
            <span class="spinner" aria-hidden="true" />
            <span>{text()}</span>
          </div>
        </Show>
        <Show when={props.children}>
          <div class="action">{props.children}</div>
        </Show>
      </div>
    </div>
  );
}
