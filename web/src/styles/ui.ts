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
    width: 100%;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-1);
    box-sizing: border-box;
    font-family: inherit;
    font-size: var(--text-body);
    line-height: var(--line-height-button);
  }
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .search-input::placeholder {
    color: var(--ink-2);
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
    font-size: var(--text-heading);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    margin: var(--space-3) 0 var(--space-2);
  }
`;

// 독립 카드 — my-rentals·mypage·예약 행 등 "떠 있는 상자"의 단일 규격.
// 흰 면 + 1px 테두리 + 12px 라운드. rows(붙어 있는 목록)와 구분된다.
export const cardCss = css`
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2);
    box-sizing: border-box;
  }
`;

// 관리자 인라인 추가 폼 — categories·allowed-emails 상단 폼의 단일 규격.
export const formCss = css`
  .form {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-sizing: border-box;
  }
  .form-row {
    display: flex;
    gap: var(--space-1);
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

// 칩 규격은 x-chip 자신만 쓰므로 `components/ui/chip.css`로 옮겼다.
