import { Show, createUniqueId } from "solid-js";

type Props = {
  label?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  rows?: number;
  min?: string;
  inputmode?: "text" | "numeric" | "tel" | "email" | "url" | "search" | "none" | "decimal";
  autocomplete?: string;
  onInput?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  class?: string;
};

export function Input(props: Props) {
  const id = createUniqueId();
  const type = () => props.type ?? "text";

  return (
    <div class={`x-input ${props.invalid ? "invalid" : ""} ${props.class ?? ""}`}>
      <Show when={props.label}>
        <label for={id}>{props.label}</label>
      </Show>
      <Show
        when={type() === "textarea"}
        fallback={
          <input
            id={id}
            class="control"
            type={type()}
            min={props.min || undefined}
            inputmode={props.inputmode || undefined}
            autocomplete={props.autocomplete}
            placeholder={props.placeholder}
            required={props.required}
            disabled={props.disabled}
            value={props.value ?? ""}
            onInput={(event) => props.onInput?.(event.currentTarget.value)}
            onKeyDown={(event) => props.onKeyDown?.(event)}
          />
        }
      >
        <textarea
          id={id}
          class="control"
          rows={props.rows ?? 2}
          placeholder={props.placeholder}
          required={props.required}
          disabled={props.disabled}
          value={props.value ?? ""}
          onInput={(event) => props.onInput?.(event.currentTarget.value)}
          onKeyDown={(event) => props.onKeyDown?.(event)}
        />
      </Show>
    </div>
  );
}
