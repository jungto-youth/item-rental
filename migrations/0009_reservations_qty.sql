-- P0 — 부분 대여: 예약 1건이 여러 개를 점유할 수 있어야 한다.
--
-- 배경: 실물 데이터(2026 물품리스트 154건)에서 20개 이상 대량 재고가 24건이었다
--   (여권케이스 107, 이어폰 92, 염주 90, 수신기 77, 조끼 50 …).
--   기존 스키마는 COUNT(*) 예약 건수를 total_qty와 비교해 '예약 1건 = 1개 점유'였다.
--   그래서 '수신기 30개만' 같은 신청은 30번 예약해야 했고, 운영이 불가능했다.
--
-- 이관: 기존 예약은 모두 1개 점유였으므로 DEFAULT 1이 정확한 이관값이다.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;

-- qty >= 1 보증. DROP + ADD를 한 문장으로 처리해 재실행에 안전하다
-- (migrate.ts는 추적 테이블 없이 매번 전체를 재실행하므로 모든 문장이 멱등해야 한다).
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_qty, ADD CONSTRAINT chk_reservations_qty CHECK (qty >= 1);

-- 가용성 판정이 SUM(qty) 기준으로 바뀌므로 기간 조회 인덱스에 qty를 포함시킨다
-- (커버링 인덱스 — idx_reservations_item_dates는 그대로 두고 확장만 한다).
CREATE INDEX IF NOT EXISTS idx_reservations_item_dates_qty ON reservations (item_id, start_date, end_date, qty);
