-- 0013 — 물품 사진 썸네일
--
-- 카드·갤러리 썸네일 줄·내 대여 목록은 221×165 안팎으로 그리는데 원본(최대 1600px,
-- 장당 평균 약 95KB)을 받고 있었다. 업로드 때 브라우저가 짧은 변 400px 썸네일을 함께
-- 만들어 R2 에 원본 옆(items/{id}/{uuid}.thumb.webp)으로 저장한다.
--
-- NULL = 아직 썸네일 없음. 응답은 COALESCE(thumb_r2_key, r2_key) 로 원본에 물러나므로
-- 기존 행은 그대로 동작하고, 관리자 화면의 '썸네일 채우기'가 나중에 채운다.
ALTER TABLE item_photos ADD COLUMN thumb_r2_key TEXT;
