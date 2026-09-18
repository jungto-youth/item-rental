-- 물품 속성 칸 단순화 — 사용자 결정(2026-09-18): size/color/note 컬럼 제거.
-- 근거: 로직·검색 어디에도 쓰이지 않았고(검색은 name/description/location만 매칭), 등록 폼(create-dialog)에는
-- 애초에 없었다. size/color 값의 보존(description 백필)은 scripts/backfill-remove-item-attrs.ts 가 먼저 수행한다.
-- migrate.ts 는 추적 테이블 없이 매번 전체를 재실행하므로 멱등이어야 한다 — 한 문장의 DROP COLUMN IF EXISTS 로만 구성.
ALTER TABLE items DROP COLUMN IF EXISTS size, DROP COLUMN IF EXISTS color, DROP COLUMN IF EXISTS note;