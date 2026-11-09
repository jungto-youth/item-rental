import { For } from "solid-js";

export type ChipOption = { value: string; label: string };

type Props = {
  value: string;
  options: ChipOption[];
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function Chip(props: Props) {
  return (
    <div
      class="flex min-w-0 flex-wrap items-center gap-2"
      role="group"
      aria-label={props.ariaLabel || undefined}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class={`inline-flex h-9 items-center rounded-pill border px-2 text-12 whitespace-nowrap ${
              option.value === props.value
                ? "border-ink-1 bg-ink-1 font-semibold text-white"
                : "border-line bg-surface font-normal text-ink-1 hover:border-line-strong hover:bg-surface-muted"
            } cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1 disabled:cursor-not-allowed disabled:opacity-45`}
            aria-pressed={option.value === props.value ? "true" : "false"}
            disabled={props.disabled}
            onClick={() => {
              if (props.disabled) return;
              if (option.value === props.value) return;
              props.onChange(option.value);
            }}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
