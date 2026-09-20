-- 물품 속성 칸 단순화 — 사용자 결정(2026-09-18): size/color/note 컬럼 제거.
-- 근거: 로직·검색 어디에도 쓰이지 않았고(검색은 name/description/location만 매칭), 등록 폼(create-dialog)에는
-- 애초에 없었다. size/color 값의 보존(description 백필)은 scripts/backfill-remove-item-attrs.ts 가 먼저 수행한다.
-- migrate.ts 는 _migrations 로 이력을 남기므로 이 파일도 최초 1회만 실행된다. 그럼에도 재적용에
-- 안전하도록 한 문장의 DROP COLUMN IF EXISTS 로만 구성한다(적용된 파일은 수정하지 않는다 — 추가 전용).
ALTER TABLE items DROP COLUMN IF EXISTS size, DROP COLUMN IF EXISTS color, DROP COLUMN IF EXISTS note;