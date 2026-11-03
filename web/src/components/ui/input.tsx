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
  max?: string;
  inputmode?: "text" | "numeric" | "tel" | "email" | "url" | "search" | "none" | "decimal";
  autocomplete?: string;
  onInput?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  class?: string;
};

export function Input(props: Props) {
  const id = createUniqueId();
  const type = () => props.type ?? "text";
  const controlClass = () =>
    `w-full rounded-card border bg-surface text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:bg-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
      props.invalid ? "border-danger" : "border-line"
    }`;

  return (
    <div class={`flex w-full flex-col gap-2 ${props.class ?? ""}`}>
      <Show when={props.label}>
        <label class="text-fine font-normal text-ink-2" for={id}>
          {props.label}
        </label>
      </Show>
      <Show
        when={type() === "textarea"}
        fallback={
          <input
            id={id}
            class={`${controlClass()} h-10 px-4 leading-[1.2]`}
            type={type()}
            min={props.min || undefined}
            max={props.max || undefined}
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
          class={`${controlClass()} min-h-[72px] resize-y px-4 py-4 leading-normal`}
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
