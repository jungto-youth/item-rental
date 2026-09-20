-- 0020 — 카테고리 재도입 (관리자 물품 관리용, 2026-11)
-- 0005·0011에서 두 번 제거됐던 카테고리를, 관리자가 물품 등록·수정 중에
-- 직접 만들고 고치는 흐름(물품 관리 페이지)과 함께 복원한다 (SPEC §4.2).
-- items.category_id 는 nullable — 미지정 물품은 '미지정'으로 보인다.
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id INTEGER
  REFERENCES categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_category ON items (category_id);
