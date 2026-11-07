type Size = "sm" | "lg";

// 칩과 로고의 크기 차이를 4px로 고정해 헤더·로그인이 같은 여백 문법을 쓴다.
const SIZES: Record<Size, { chip: string; mark: string }> = {
  sm: { chip: "size-8", mark: "size-6" },
  lg: {
    chip: "size-12 min-[600px]:size-14",
    mark: "size-10 min-[600px]:size-12",
  },
};

/**
 * 브랜드 로고 — 헤더·로그인에서 같은 원형 칩 모양을 쓴다.
 * `logo.svg` 벡터 자산이라 어떤 크기에서도 선명하다.
 */
export function BrandLogo(props: { size?: Size }) {
  const size = () => SIZES[props.size ?? "sm"];
  return (
    <span
      class={`inline-flex shrink-0 items-center justify-center rounded-pill bg-surface ${size().chip}`}
    >
      <img src="/logo.svg" alt="" class={`block ${size().mark}`} />
    </span>
  );
}
