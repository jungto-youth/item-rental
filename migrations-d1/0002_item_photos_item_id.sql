-- item_photos.item_id 인덱스 — SQLite 는 FK 컬럼에 자동 인덱스를 만들지 않는다.
-- 목록·상세·대시보드의 사진 상관 서브쿼리(WHERE item_id = ? ORDER BY sort_order)가
-- 매번 item_photos 전수 스캔을 하지 않게 한다. sort_order 까도 커버.
CREATE INDEX IF NOT EXISTS idx_item_photos_item
  ON item_photos (item_id, sort_order);
