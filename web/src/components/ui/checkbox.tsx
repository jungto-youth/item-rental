import { createEffect } from "solid-js";

type Props = {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  disabled?: boolean;
  class?: string;
  onChange: (checked: boolean) => void;
};

// 목록 다중 선택용 체크박스 — 브라우저 기본 컨트롤에 디자인 토큰 색만 입힌다.
export function Checkbox(props: Props) {
  let input: HTMLInputElement | undefined;

  createEffect(
    () => props.indeterminate,
    (indeterminate) => {
      if (input) input.indeterminate = indeterminate === true;
    },
  );

  return (
    <input
      ref={(el) => {
        input = el;
      }}
      type="checkbox"
      class={`size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-45 ${props.class ?? ""}`}
      checked={props.checked}
      disabled={props.disabled}
      aria-label={props.label}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}
