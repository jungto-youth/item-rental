-- 0022 — 키워드 검색 인덱스 (pg_trgm), 2026-09
-- ILIKE '%…%'는 btree 인덱스를 못 쓰지만 trigram GIN 인덱스는 가속할 수 있다.
-- 키워드 검색이 OR-완화로 넓어지는 만큼 매 검색 스캔 비용을 인덱스로 흡수한다.
-- 한글은 어간 분석이 필요 없고(사용자가 완성된 명사를 입력함) trigram 부분 문자열 매칭이 잘 맞는다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON items USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_description_trgm
  ON items USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_location_trgm
  ON items USING gin (location gin_trgm_ops);

-- 태그 이름도 키워드 검색 대상(0021 카테고리 조인)이라 같이 가속
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON categories USING gin (name gin_trgm_ops);
