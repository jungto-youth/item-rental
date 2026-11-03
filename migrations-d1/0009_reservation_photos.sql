-- 0009 — 반납 사진 (BACKLOG B-12)
--
-- 반납은 회원이 직접 처리할 수 있고, 그 경우 reservations.admin_id 가 비어 '회원이
-- 직접 반납했다'는 자기신고로만 남는다. 반납 시점의 물품 상태 사진을 남겨 관리자가
-- 회수·파손 여부를 확인할 수 있게 한다.
--
-- 사진은 물품 카탈로그 사진(item_photos)과 별개다. item_photos 에 섞으면 공개 상세
-- 갤러리와 3장 제한을 공유하게 되어, 반납 사진이 물품 사진처럼 노출된다.
-- 업로드 주체(uploaded_role)를 남겨 회원 첨부와 관리자 확인 사진을 구분한다.
-- R2 키는 'reservations/{reservation_id}/{uuid}.{ext}' 이고, 열람 권한은 본인 또는
-- 관리자로 제한한다(사진 서빙 라우트가 r2_key 로 예약을 역조회한다).
CREATE TABLE IF NOT EXISTS reservation_photos (
  id             INTEGER PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  r2_key         TEXT NOT NULL UNIQUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  uploaded_role  TEXT NOT NULL CHECK (uploaded_role IN ('member', 'admin')),
  uploaded_by    TEXT REFERENCES members (id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_photos_reservation
  ON reservation_photos (reservation_id, sort_order);
