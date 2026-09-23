-- 의미 검색 () — pgvector 확장 + 물품 임베딩 컬럼
-- 임베딩 모델: Cloudflare Workers AI @cf/baai/bge-m3 (다국어, 1024차원)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE items ADD COLUMN IF NOT EXISTS embedding vector(1024);
