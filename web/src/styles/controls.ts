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
