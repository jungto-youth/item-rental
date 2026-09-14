-- 물품 대여 목록 시트(2026 물품리스트)에서 가져온 항목의 출처 키
-- review.csv 의 'ID'(Y26-###)를 그대로 담아 재수입을 멱등하게 만든다.
-- 7개 이름 중복 그룹(조끼 사이즈별 등)이 있어 이름 기준 멱등은 쓸 수 없다.
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_key TEXT;

-- 부분 유니크 인덱스 — 기존 수동 등록 물품(source_key IS NULL)은 제약에서 제외
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_key
  ON items (source_key) WHERE source_key IS NOT NULL;
