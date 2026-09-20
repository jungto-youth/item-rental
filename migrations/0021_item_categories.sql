-- 0021 — 카테고리 다대다 (태그) 전환, 2026-11
-- 0020의 단일 items.category_id 를 item_categories 조인 테이블로 바꾼다.
-- 물품은 태그를 0개~여러 개 가질 수 있고(0개 = 미지정), 태그 삭제는 CASCADE 로
-- 연결만 끊는다. 이름 UNIQUE 유지 — 중복 태그 발생 방지.
CREATE TABLE IF NOT EXISTS item_categories (
  item_id     INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);

-- 기존 단일 연결 백필 (있으면)
INSERT INTO item_categories (item_id, category_id)
SELECT id, category_id FROM items WHERE category_id IS NOT NULL;

ALTER TABLE items DROP COLUMN IF EXISTS category_id;

CREATE INDEX IF NOT EXISTS idx_item_categories_category
  ON item_categories (category_id);