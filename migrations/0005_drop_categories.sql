-- 카테고리 제거 (v2.5) — 탐색은 키워드+의미 검색으로 완전 대체
-- items.category_id 컬럼을 지우면 그 컬럼의 FK 제약도 함께 제거됨
ALTER TABLE items DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS categories;
