import { Show } from "solid-js";
import { SearchIcon } from "../icons";

type Props = {
  value: string;
  onInput: (value: string) => void;
  label: string;
  placeholder: string;
  class?: string;
};

// 관리자 목록 공용 검색 — 입력이 있으면 지우기 버튼을 보이고 Esc 로도 비운다.
export function SearchField(props: Props) {
  return (
    <div class={`relative ${props.class ?? ""}`}>
      <Show when={!props.value}>
        <SearchIcon class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />
      </Show>
      <input
        class="box-border h-10 w-full min-w-0 rounded-card border border-line bg-surface py-2 pr-10 pl-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        type="search"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && props.value) {
            event.preventDefault();
            props.onInput("");
          }
        }}
      />
      <Show when={props.value}>
        <button
          type="button"
          class="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-fine text-ink-2 hover:bg-surface-muted hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
          aria-label="검색어 지우기"
          title="검색어 지우기"
          onClick={() => props.onInput("")}
        >
          ✕
        </button>
      </Show>
    </div>
  );
}
