import { css } from "lit";

// 본문 섹션의 공용 조각 — 페이지 로컬 스타일 복사를 막는다.

// 문단 소제목(h2) — 마이페이지·대여 내역 등 섹션 제목 규격.
export const sectionHeadingCss = css`
  h2 {
    font-size: var(--text-heading, 1.0625rem);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    margin: var(--space-5) 0 var(--space-3);
  }
`;

// 링크형 버튼 — 카드·행 안에서 쓰는 작은 보더 버튼.
// mypage(:focus-visible)와 my-rentals(:disabled·.danger)의 합집합 규격이다.
export const linkButtonCss = css`
  .link-btn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 6px);
    color: var(--color-primary);
    cursor: pointer;
    padding: 5px 12px;
    font-size: var(--text-caption, 13px);
    font-weight: 500;
    font-family: inherit;
    transition: all 0.12s ease;
  }
  .link-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }
  .link-btn:focus-visible {
    outline: 2px solid var(--color-primary-focus);
    outline-offset: 1px;
  }
  .link-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .link-btn.danger {
    border-color: transparent;
    color: var(--color-danger);
  }
  .link-btn.danger:hover:not(:disabled) {
    background: var(--tone-danger-bg);
    border-color: var(--color-danger);
  }
`;
