import { css } from "lit";
// 각 컴포넌트의 static styles 배열 맨 앞에 붙인다 — shadow root마다 별도로 필요하다
// (tokens.css 같은 문서 스타일은 Shadow DOM 안으로 닿지 않는다)
export const reduceMotion = css`
  @media (prefers-reduced-motion: reduce) {
    :host,
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
`;
