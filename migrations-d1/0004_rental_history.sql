-- 대여 이력의 보존성 보강 — 이력이 '지금 상태의 투영'이던 것을 '그 시점의 사실'로 바꾼다.
--
-- 배경:
--   1) reservations 는 item_id/member_id 만 들고 이름·위치는 JOIN 으로 끌어온다.
--      물품명이나 위치를 고치면 과거 대여 이력의 표기까지 함께 바뀐다 — 이력의 존재 이유와
--      정면으로 어긋난다. 0019 가 rental_history 스냅샷 테이블을 내린 근거("원본 raw_festa.json
--      에 남아 있어 재구축 가능")도 그 파일이 사라져 더 이상 성립하지 않는다.
--      스냅샷 테이블을 되살리지 않고 컬럼 2개만 두는 이유: 0019 이 실패한 이유가
--      "조회 전용 자료가 운영 큐와 무관했다"는 이중 쓰기였고, 쓰기 경로가
--      createReservation 하나뿐이면 컬럼 세팅으로 충분하다.
--   2) 반납일은 updated_at('마지막 상태 전이 시각')에서 읽고 있었다. 나중에 반환한 행을
--      다시 손보면 반납일이 조용히 바뀌고, returned_by_member 판정(status='returned'
--      AND admin_id IS NULL)과 시각 기준이 서로 다른 열에 흩어져 있었다.
--   3) 대여 기록 목록은 created_at DESC 로 정렬하는데 그 인덱스가 없었다.
--
-- admin_memo 는 관리자가 반납 처리할 때 남기는 메모다. 지금은 writer 가 없어 채워지지 않는다 —
-- 반납 메모를 받을 API 를 붙일 때 쓰기 경로를 함께 추가한다.

ALTER TABLE reservations ADD COLUMN item_name_snapshot     TEXT;
ALTER TABLE reservations ADD COLUMN item_location_snapshot TEXT;
ALTER TABLE reservations ADD COLUMN returned_at            TEXT;
ALTER TABLE reservations ADD COLUMN admin_memo              TEXT;

-- 대여 기록 정렬(created_at DESC)과 기간 집계의 인덱스.
-- 기존 두 인덱스(member_id, status) / (item_id, status, qty)는 회원·물품 축만 커버한다.
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations (created_at DESC);

-- 역채움 — 이미 쌓인 행에 새 의미를 부여한다.
-- 반환 완료 건의 updated_at 은 정의상 반납 시각이므로 그대로 옮긴다.
UPDATE reservations SET returned_at = updated_at WHERE status = 'returned';

UPDATE reservations
   SET item_name_snapshot     = (SELECT name     FROM items WHERE items.id = reservations.item_id),
       item_location_snapshot = (SELECT location FROM items WHERE items.id = reservations.item_id)
 WHERE item_name_snapshot IS NULL;