import { For } from "solid-js";

export type ChipOption = { value: string; label: string };

type Props = {
  value: string;
  options: ChipOption[];
  ariaLabel?: string;
  size?: "sm" | "lg";
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function Chip(props: Props) {
  const size = () => props.size ?? "sm";
  return (
    <div
      class={`x-chip chips size-${size()}`}
      role="group"
      aria-label={props.ariaLabel || undefined}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class={`chip ${option.value === props.value ? "active" : ""}`}
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
