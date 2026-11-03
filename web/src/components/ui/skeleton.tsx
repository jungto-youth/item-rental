type Props = {
  class?: string;
  /** 글자 줄은 line, 사진·버튼 자리처럼 큰 면은 muted */
  tone?: "line" | "muted";
};

/** 콘텐츠가 들어올 자리를 미리 잡아 두는 로딩 블록 */
export function Skeleton(props: Props) {
  return (
    <div
      class={`animate-[pulse_1.4s_ease-in-out_infinite] ${
        props.tone === "muted" ? "bg-surface-muted" : "bg-line"
      } ${props.class ?? ""}`}
      aria-hidden="true"
    />
  );
}
