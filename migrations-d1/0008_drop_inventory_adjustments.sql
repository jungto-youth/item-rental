-- 0008 — 재고 수량 조정 이력 기능 제거
--
-- 수량 변경은 물품 수정 화면의 보유 수량 입력으로 일원화한다. 조정 이력
-- 저장·조회 기능과 함께 테이블을 제거한다.
DROP INDEX IF EXISTS idx_inventory_adjustments_item;
DROP TABLE IF EXISTS inventory_adjustments;
