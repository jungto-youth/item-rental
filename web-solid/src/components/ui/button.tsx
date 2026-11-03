import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export type ButtonVariant = "primary" | "secondary" | "danger";

type Props = {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
  class?: string;
  onClick?: (event: MouseEvent) => void;
  children?: JSX.Element;
};

export function Button(props: Props) {
  const variant = () => props.variant ?? "primary";
  return (
    <span class={`x-button-host ${props.class ?? ""}`}>
      <button
        type={props.type ?? "button"}
        class={`x-button variant-${variant()}`}
        disabled={props.disabled || props.loading}
        title={props.title}
        aria-label={props.ariaLabel}
        onClick={(event) => props.onClick?.(event)}
      >
        <Show when={props.loading}>
          <span class="spinner" aria-hidden="true" />
        </Show>
        {props.children}
      </button>
    </span>
  );
}
