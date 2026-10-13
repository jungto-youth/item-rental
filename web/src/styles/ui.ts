import { css } from "lit";

// 공용 UI 조각 — 페이지·컴포넌트가 각자 복사하던 스타일의 단일 출처.
// controls.ts(검색 input)·sections.ts(섹션 제목·링크 버튼)를 흡수했다.
// 규칙: 이 파일에 없는 값(raw px·스케일 밖 폰트)은 새로 만들지 않는다.

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

// 검색 필드 — home·관리자 목록 공용. 높이 44px로 x-input과 통일.
// 클리어 버튼 자리 같은 레이아웃 값만 사용처가 뒤에서 오버라이드한다.
export const searchFieldCss = css`
  .search-input {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 var(--space-3, 12px);
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
  .search-input:focus-visible {
    outline: 2px solid var(--color-primary-focus);
    outline-offset: 1px;
  }
  .search-input::placeholder {
    color: var(--color-muted);
  }
  /* type="search" 의 브라우저 기본 지우개는 이 디자인의 클리어 버튼과 겹친다 */
  .search-input::-webkit-search-cancel-button,
  .search-input::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
  }
`;

// 본문 섹션 소제목(h2) 규격.
export const sectionTitleCss = css`
  h2 {
    font-size: var(--text-heading, 1.0625rem);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    margin: var(--space-5) 0 var(--space-3);
  }
`;

// 독립 카드 — my-rentals·mypage·예약 행 등 "떠 있는 상자"의 단일 규격.
// radius-lg + padding space-4. rows(붙어 있는 목록)와 구분된다.
export const cardCss = css`
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-4, 16px);
    box-sizing: border-box;
  }
`;

// 관리자 인라인 추가 폼 — categories·allowed-emails 상단 폼의 단일 규격.
export const formCss = css`
  .form {
    display: grid;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-4, 16px);
    padding: var(--space-3-5, 14px) var(--space-4, 16px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 12px);
    background: var(--color-surface);
    box-sizing: border-box;
  }
  .form-row {
    display: flex;
    gap: var(--space-2, 8px);
    align-items: flex-end;
  }
  .form-row x-input {
    flex: 1;
    min-width: 0;
  }
  .form-row x-button {
    flex-shrink: 0;
  }
`;

// 칩 — x-chip 본체의 단일 시각 규격.
// 32px pill, 미선택(surface) → 선택(primary 채움). 행 높이를 바꾸지 않기 위해
// 줄바꿈 없이 가로 스크롤한다.
export const chipCss = css`
  .chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    height: 32px;
    padding: 0 var(--space-3, 12px);
    border-radius: var(--radius-pill, 999px);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-muted);
    font-size: var(--text-caption, 13px);
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    text-decoration: none;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }
  .chip:hover {
    border-color: var(--color-muted);
    color: var(--color-text);
  }
  .chip:focus-visible {
    outline: 2px solid var(--color-primary-focus);
    outline-offset: 1px;
  }
  .chip.active {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-primary-text);
  }
  .chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .chip .count {
    font-size: var(--text-fine, 12px);
    opacity: 0.85;
  }
`;
