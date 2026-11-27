import { Show } from "solid-js";

// 수량 스테퍼 — 대여 신청 폼과 장바구니가 같은 규격을 쓴다.
// max 가 1 이면 조절할 것이 없으므로 단건 폼과 같은 고정 표시를 유지한다.
export function QuantityStepper(props: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  class?: string;
}) {
  const max = () => Math.max(1, props.max);
  const clamp = (value: number) => Math.min(Math.max(value, 1), max());

  return (
    <Show
      when={max() > 1}
      fallback={
        <span class="inline-flex h-10 items-center rounded-card border border-line bg-surface px-4 text-body font-semibold text-ink-1">
          1개
        </span>
      }
    >
      <div
        class={`inline-flex h-10 items-center overflow-hidden rounded-card border border-line bg-surface ${props.class ?? ""}`}
      >
        <button
          type="button"
          class="flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-20 text-ink-2 enabled:hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => props.onChange(clamp(props.value - 1))}
          disabled={props.value <= 1}
          aria-label={`${props.label} 수량 감소`}
        >
          −
        </button>
        <input
          class="h-10 w-12 border-x border-line bg-transparent text-center text-body font-semibold text-ink-1 focus:border-primary focus:outline-none"
          type="number"
          inputmode="numeric"
          min="1"
          max={max()}
          value={props.value}
          onInput={(event) => {
            const value = parseInt(event.currentTarget.value, 10);
            if (Number.isFinite(value)) props.onChange(clamp(value));
          }}
          onBlur={(event) => {
            const value = parseInt(event.currentTarget.value, 10);
            const next = Number.isFinite(value) ? clamp(value) : 1;
            props.onChange(next);
            event.currentTarget.value = String(next);
          }}
          aria-label={`${props.label} 수량 직접 입력`}
        />
        <button
          type="button"
          class="flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-20 text-ink-2 enabled:hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => props.onChange(clamp(props.value + 1))}
          disabled={props.value >= max()}
          aria-label={`${props.label} 수량 증가`}
        >
          +
        </button>
      </div>
    </Show>
  );
}
