-- 카테고리 이름 중복 방지 (admin/categories.ts 409 처리용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories (name);
