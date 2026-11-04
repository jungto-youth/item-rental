import { For } from "solid-js";
import type { JSX } from "@solidjs/web";

export type InfoItem = {
  label: string;
  value: JSX.Element;
  /** 값이 길 때 툴팁으로 전체 내용을 보여준다 */
  title?: string;
  strong?: boolean;
};

// 라벨·값 행 목록 — 내 정보, 물품 상세가 함께 쓴다.
// 페이지마다 dl/dt/dd 스타일을 다시 정의하지 않도록 여기 한 곳에서만 관리한다.
export function InfoList(props: {
  items: InfoItem[];
  /** 첫 행(수량 등 핵심 값)을 굵게 */
  strongFirst?: boolean;
  /** 행 구분선과 목록 위아래 선 표시 (기본 true) */
  divided?: boolean;
  class?: string;
}) {
  const divided = props.divided !== false;
  return (
    <dl class={`mt-6 ${divided ? "border-y border-line" : ""} ${props.class ?? ""}`}>
      <For each={props.items}>
        {(item, index) => (
          <div class={`flex items-center justify-between gap-4 py-2 ${divided ? "border-b border-line last:border-b-0" : ""}`}>
            <dt class="text-fine font-normal text-ink-2">{item.label}</dt>
            <dd
              class={`m-0 truncate text-body text-ink-1 tabular-nums ${
                item.strong || (props.strongFirst && index() === 0)
                  ? "font-semibold"
                  : ""
              }`}
              title={item.title}
            >
              {item.value}
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}
