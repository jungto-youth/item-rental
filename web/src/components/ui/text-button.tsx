import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

// 테두리·면 없는 텍스트 버튼 — '목록으로', '더보기'처럼 주 액션이 아닌
// 내비게이션·반복 동작에 쓴다. hover는 배경 없이 글자색(또는 danger 밑줄)으로 바뀐다.
// href가 있으면 <a>, 없으면 <button>으로 렌더한다.
const BASE =
  "inline-flex h-9 cursor-pointer items-center gap-1 rounded-card text-14 font-medium no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4";

const TONES = {
  default: "text-ink-2 hover:text-ink-1",
  danger: "text-danger hover:underline",
};

type Props = {
  href?: string;
  onClick?: (event: MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  /** 기본은 보조 텍스트, danger 는 삭제처럼 파괴적인 동작 */
  tone?: "default" | "danger";
  /** 글자 앞 아이콘 */
  icon?: JSX.Element;
  /** 글자 뒤 아이콘 — 로딩 중에는 숨긴다 */
  iconAfter?: JSX.Element;
  class?: string;
  children?: JSX.Element;
};

export function TextButton(props: Props) {
  const content = () => (
    <>
      <Show when={props.loading} fallback={props.icon}>
        <span
          class="size-3.5 animate-[spin_0.6s_linear_infinite] rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      </Show>
      <span>{props.children}</span>
      <Show when={!props.loading}>{props.iconAfter}</Show>
    </>
  );

  return (
    <Show
      when={props.href}
      fallback={
        <button
          type="button"
          class={`${BASE} ${TONES[props.tone ?? "default"]} border-0 bg-transparent p-0 ${props.class ?? ""}`}
          disabled={props.disabled || props.loading}
          onClick={(event) => props.onClick?.(event)}
        >
          {content()}
        </button>
      }
    >
      {(href) => (
        <a
          class={`${BASE} ${TONES[props.tone ?? "default"]} ${props.class ?? ""}`}
          href={href()}
          onClick={(event) => props.onClick?.(event)}
        >
          {content()}
        </a>
      )}
    </Show>
  );
}
