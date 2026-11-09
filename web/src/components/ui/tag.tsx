import type { JSX } from "@solidjs/web";

// 정적 알약 라벨 — 분류·대표처럼 상태 변화가 없는 태그.
// 규격: 24px 높이, 12px 글자, 좌우 8px, primary-soft.
export function Tag(props: { children?: JSX.Element; class?: string }) {
  return (
    <span
      class={`inline-flex h-6 items-center rounded-pill bg-primary-soft px-2 text-12 text-primary-strong ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  );
}
