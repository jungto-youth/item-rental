import { css } from "lit";

// number input — 브라우저 기본 스피너(▲▼) 숨김.
// shadow DOM 안의 input에는 전역 CSS(tokens.css)가 침투하지 않으므로,
// number input을 쓰는 컴포넌트에서 이 조각을 import 해야 한다.
export const numberInputCss = css`
  input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

// 검색 input — home(44px + 클리어 버튼 자리)과 관리자 툴바(40px + flex:1)의
// 공통 시각 조형. 높이·우측 패딩 같은 레이아웃 값은 사용처가 뒤에서 오버라이드한다.
export const searchInputCss = css`
  .search-input {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface);
    color: var(--color-text);
    box-sizing: border-box;
    font-family: inherit;
    font-size: var(--text-body, 15px);
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    background: var(--color-bg);
  }
  .search-input::placeholder {
    color: var(--color-muted);
  }
`;
