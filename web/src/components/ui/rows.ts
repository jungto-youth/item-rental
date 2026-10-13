import { css } from "lit";

// 인라인 편집 행 공용 조형 — categories·allowed-emails가 같은 줄 목록을 쓴다.
// (물품·예약·회원 행은 item-row·reservation-row 카드로 이전했다.)
// 컨테이너: 1px 헤어라인 + radius-md + surface 배경, 로우는 하이라인으로 구분.
// 로우 1번째 줄 .head = 이름(.name, 말줄임) + 배지 + 액션 버튼, 2번째 줄 .meta = 부가 정보.
// 행 안 액션은 x-button 을 쓴다 — 작은 raw 버튼은 터치 타겟이 36px 아래로 떨어진다.
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
    padding: var(--space-3-5, 14px) var(--space-4, 16px);
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
`;
