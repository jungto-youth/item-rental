import { css } from "lit";

// 관리자 로우 목록 공통 조형 — 대시보드·대여 관리·회원 관리가 같은 카드 리스트를 쓴다.
// 컨테이너: 1px 헤어라인 + radius-md + surface 배경, 로우는 하이라인으로 구분.
// 로우 1번째 줄 .head = 이름(.name, 말줄임) + 배지 + 액션 .link, 2번째 줄 .meta = 부가 정보.
// 페이지별 추가 스타일은 각 페이지가 뒤에 덧붙인다 (같은 선택자는 뒤가 이긴다).
export const rowsCss = css`
  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface);
    overflow: hidden; /* 모서리 — 마지막 로우 보더가 라운드 밖으로 나가지 않게 */
  }
  .row {
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-3-5);
    display: grid;
    gap: var(--space-1);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
  }
  .head .link {
    flex-shrink: 0;
  }
  .head x-badge {
    flex-shrink: 0;
  }
  .name {
    font-weight: 600;
    font-size: var(--text-body);
    letter-spacing: var(--tracking-tight);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--color-muted);
    font-size: var(--text-caption);
  }
  .link {
    background: none;
    border: 0;
    color: var(--color-primary);
    cursor: pointer;
    padding: var(--space-2);
    font-size: var(--text-caption);
    font-family: inherit;
  }
  .link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .link.danger {
    color: var(--tone-danger-text);
  }
  .msg {
    color: var(--color-primary);
    font-size: var(--text-caption);
    min-height: 1.2em;
  }
`;