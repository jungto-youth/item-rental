import { css } from "lit";

// 변형(variant)별 색·테두리만 모아둔다.
// 크기·상태·동작은 index.ts 가 소유한다 — 새 변형은 이 파일에 블록 하나만 추가하면 된다.
export const buttonVariantsCss = css`
  /* Primary: 오렌지 솔리드 — 화면의 주 액션 하나에만 */
  .variant-primary {
    background: var(--primary);
    color: #fff;
    border: 1px solid var(--primary);
  }
  .variant-primary:hover:not(:disabled) {
    background: var(--primary-strong);
    border-color: var(--primary-strong);
  }

  /* Secondary: 흰 면 + 헤어라인 — 보조 액션 */
  .variant-secondary {
    background: var(--surface);
    color: var(--ink-1);
    border: 1px solid var(--border);
  }
  .variant-secondary:hover:not(:disabled) {
    border-color: var(--border-strong);
    background: var(--surface-muted);
  }

  /* Danger: 파괴적 액션 — 위험색 아웃라인 */
  .variant-danger {
    background: var(--surface);
    color: var(--danger);
    border: 1px solid var(--danger);
  }
  .variant-danger:hover:not(:disabled) {
    background: var(--danger-soft);
  }
`;
