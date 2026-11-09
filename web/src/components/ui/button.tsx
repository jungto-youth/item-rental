import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-solid";

type Props = {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  /** 폼 밖에서 제출할 때 연결할 form id */
  form?: string;
  title?: string;
  ariaLabel?: string;
  class?: string;
  onClick?: (event: MouseEvent) => void;
  children?: JSX.Element;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-primary-strong bg-primary-strong text-white enabled:hover:border-primary-deep enabled:hover:bg-primary-deep",
  secondary:
    "border border-line bg-surface text-ink-1 enabled:hover:border-line-strong enabled:hover:bg-surface-muted",
  danger:
    "border border-danger bg-surface text-danger enabled:hover:bg-danger-soft",
  "danger-solid":
    "border border-danger bg-danger text-white enabled:hover:opacity-90",
};

export function Button(props: Props) {
  const variant = () => props.variant ?? "primary";
  return (
    <span class={`inline-block ${props.class ?? ""}`}>
      <button
        type={props.type ?? "button"}
        class={`inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-card border px-4 text-14 font-semibold whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant()]}`}
        disabled={props.disabled || props.loading}
        form={props.form}
        title={props.title}
        aria-label={props.ariaLabel}
        onClick={(event) => props.onClick?.(event)}
      >
        <Show when={props.loading}>
          <span
            class="size-3.5 animate-[spin_0.6s_linear_infinite] rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
        </Show>
        {props.children}
      </button>
    </span>
  );
}
