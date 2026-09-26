import { css } from "lit";

// 공용 셀렉트 스타일 — 네이티브 select를 미니멀 디자인에 맞춰 정돈.
// appearance:none + 커스텀 체브런(var(--arrow-chevron), 테마 자동 추적),
// focus 링(primary-tint), disabled 상태를 한 곳에서 정의한다.
// 높이·글자 크기·라운드는 사용처(툴바 40px / 폼 44px / 인라인 컴팩트)가 뒤에 오버라이드한다.
export const selectCss = css`
  select {
    appearance: none;
    padding: 0 32px 0 12px; /* 우측 여백 = 체브런 자리 + 거리 확보 */
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    background-color: var(--color-surface);
    background-image: var(--arrow-chevron);
    background-repeat: no-repeat;
    background-position: right 10px center;
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--text-body, 15px);
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  select:hover:not(:disabled) {
    border-color: var(--color-muted);
  }

  select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-tint);
  }

  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

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
