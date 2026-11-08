import { For, Show, createUniqueId } from "solid-js";
import { ChevronDownIcon } from "../icons";

type Option = string;

type Props = {
  label?: string;
  value?: string;
  options: readonly Option[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  class?: string;
  onChange?: (value: string) => void;
};

// Input 과 같은 모양의 공용 select — 지부·지회·모둠처럼 정해진 목록에서 고를 때 쓴다.
export function Select(props: Props) {
  const id = createUniqueId();
  const controlClass = () =>
    `h-10 w-full cursor-pointer appearance-none rounded-card border bg-surface px-4 pr-10 text-body leading-[1.2] text-ink-1 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
      props.invalid ? "border-danger" : "border-line"
    }`;

  return (
    <div class={`flex w-full flex-col gap-2 ${props.class ?? ""}`}>
      <Show when={props.label}>
        <label class="text-fine font-normal text-ink-2" for={id}>
          {props.label}
        </label>
      </Show>
      <Show when={props.options} keyed>
        {(options) => (
          <span class="relative block">
            <select
              id={id}
              class={controlClass()}
              required={props.required}
              disabled={props.disabled}
              value={props.value ?? ""}
              onChange={(event) => props.onChange?.(event.currentTarget.value)}
            >
              <Show when={props.placeholder}>
                <option value="" disabled>
                  {props.placeholder}
                </option>
              </Show>
              <For each={options}>
                {(option) => <option value={option}>{option}</option>}
              </For>
            </select>
            <span
              class="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-3 [&_svg]:block [&_svg]:size-4"
              aria-hidden="true"
            >
              <ChevronDownIcon />
            </span>
          </span>
        )}
      </Show>
    </div>
  );
}
