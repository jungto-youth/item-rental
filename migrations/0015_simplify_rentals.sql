-- 대여 시스템 단순화 — 날짜·최대 대여일·승인/거부 제거.
--
-- 배경: 기존 흐름은 pending → approved → picked_up → returned 의 4단계 상태기계에
--   기간(start_date/end_date)과 물품별 최대 대여일(items.max_days)을 조합해
--   '일별 점유'로 가용성을 판정했다. 지부 규모(물품 97개, 동시 이용자 수 명)에서는
--   이 정밀도가 운영 부담만 만들었다 — 관리자가 승인·거절을 매번 판단해야 하고,
--   회원은 날짜를 고르기 위해 캘린더를 읽어야 했다.
--
-- 새 흐름: 회원이 수량+메모로 신청하면 즉시 '대여 중'(rented)이 되고,
--   관리자는 반납(returned)만 처리한다. 취소(cancelled)는 본인이 수령 전에만.
--   가용성은 "지금 대여 중인 수량의 합"만 센다 — 날짜 개념이 없으므로 일별 점유도 없다.
--
-- 상태 이관: pending/approved/picked_up 은 모두 '아직 반납되지 않은 대여'이므로
--   rented 로 합친다. returned 는 그대로, rejected/cancelled 는 cancelled 로 합친다
--   (거절 개념이 사라졌으므로 '성사되지 않은 건'이라는 의미로 통일).
--
-- migrate.ts 는 추적 테이블 없이 매번 전체를 재실행하므로 모든 문장이 멱등해야 한다.

-- 1) 상태 이관 — CHECK 제약을 걸기 전에 먼저 값을 정리한다
UPDATE reservations SET status = 'rented' WHERE status IN ('pending', 'approved', 'picked_up');
UPDATE reservations SET status = 'cancelled' WHERE status IN ('rejected', 'cancelled');

-- 2) 상태 집합을 3종으로 고정 — 오타나 옛 값이 다시 들어오지 못하게 한다.
--    DEFAULT 도 함께 바꾼다: 기본값이 'pending' 으로 남아 있으면 status 를 생략한 INSERT 가
--    CHECK 위반으로 죽는다 (앱은 항상 'rented' 를 명시하지만, 스키마 자체가 일관돼야 한다).
ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'rented';
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status, ADD CONSTRAINT chk_reservations_status CHECK (status IN ('rented', 'returned', 'cancelled'));

-- 3) 날짜·거절 사유 컬럼 제거.
--    status_note 는 거절 사유 전용이었다 — 거절이 없어져 쓰이지 않는다.
--    start_date/end_date 를 참조하던 인덱스는 컬럼과 함께 자동 삭제되지만,
--    재실행 안전성을 위해 명시적으로 먼저 지운다.
DROP INDEX IF EXISTS idx_reservations_item_dates;
DROP INDEX IF EXISTS idx_reservations_item_dates_qty;
ALTER TABLE reservations DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS end_date, DROP COLUMN IF EXISTS status_note;

-- 4) 물품별 최대 대여일 제거 — 기간 개념 자체가 없어졌다
ALTER TABLE items DROP COLUMN IF EXISTS max_days;

-- 5) 가용성 판정용 인덱스 — 이제 "이 물품의 대여 중 수량 합"만 세므로
--    (item_id, status) 복합 인덱스가 그대로 최적이다. qty 를 포함해 커버링으로 만든다.
CREATE INDEX IF NOT EXISTS idx_reservations_item_status_qty ON reservations (item_id, status, qty);
