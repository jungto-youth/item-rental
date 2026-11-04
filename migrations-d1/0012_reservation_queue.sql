-- 0012 — 예약(반납 대기열) 도입
--
-- 재고를 세 영역으로 나눈다.
--   rented   : 실제 대여 중        — 점유
--   pending  : 승인 대기, 배정 완료 — 점유
--   reserved : 반납을 기다리는 예약 — 미점유
--
-- 불변식
--   rented + pending <= R          (R = total_qty - qty_repair)
--   신규 reserved    <= R
--   rented + pending + reserved <= R 로 제한하지 않는다 — 예약은 미래 반납분에 대한 순번이다.
--
-- 신청 한 건은 재고가 있는 부분(pending)과 부족한 부분(reserved)으로 나뉘어
-- 최대 2행이 되고, 같은 group_id 로 묶인다.
--
-- 주의 — reservation_photos FK CASCADE
--   reservation_photos.reservation_id 는 reservations(id) 를 ON DELETE CASCADE 로 참조한다.
--   D1 은 FK 를 끌 수 없으므로 reservations 를 그냥 DROP 하면 반납 사진이 함께 삭제된다.
--   따라서 자식(reservation_photos)을 먼저 백업·제거하고, 부모를 교체한 뒤 자식을 복원한다.
--
-- 기존 pending 강등
--   지금까지 pending 은 재고를 점유하지 않아 초과 데이터가 있을 수 있다. 물품별로
--   created_at, id 순서(FIFO)로 누적해 예산(R - rented) 안에 완전히 들어오는 행만 pending
--   으로 남기고, 예산을 넘는 행은 통째로 reserved 로 내린다(행 분할 없음).
--   강등 결과 reserved > R 이 될 수 있으나 강제 취소하지 않는다 — 신규 예약만 차단된다.
--
-- D1 은 BEGIN/COMMIT 을 받지 않는다. 이 파일 전체는 migrations apply 의 batch 한 트랜잭션으로
-- 실행되므로 중간 실패 시 전부 롤백된다.

-- 1) 새 reservations — status CHECK 에 'reserved', group_id 추가
CREATE TABLE reservations_new (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items (id),
  member_id   TEXT NOT NULL REFERENCES members (id),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'reserved', 'rented', 'returned', 'cancelled', 'rejected')),
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  item_name_snapshot     TEXT,
  item_location_snapshot TEXT,
  returned_at            TEXT,
  admin_memo             TEXT,
  due_at                 TEXT,
  member_affiliation_snapshot TEXT,
  decided_by     TEXT REFERENCES members (id),
  decided_at     TEXT,
  rejected_reason TEXT,
  -- 한 신청을 이루는 행들을 묶는 키. 기존 행은 아래에서 'legacy-<id>' 로 역채운다.
  group_id    TEXT
);

INSERT INTO reservations_new (
  id, item_id, member_id, status, member_memo, admin_id,
  created_at, updated_at, qty,
  item_name_snapshot, item_location_snapshot, returned_at, admin_memo, due_at,
  member_affiliation_snapshot, decided_by, decided_at, rejected_reason,
  group_id
)
SELECT
  id, item_id, member_id, status, member_memo, admin_id,
  created_at, updated_at, qty,
  item_name_snapshot, item_location_snapshot, returned_at, admin_memo, due_at,
  member_affiliation_snapshot, decided_by, decided_at, rejected_reason,
  NULL
FROM reservations;

-- 2) 자식 테이블 백업 (FK 없는 임시 테이블 — 여기에는 CASCADE 가 없다)
CREATE TABLE _reservation_photos_backup AS
SELECT id, reservation_id, r2_key, sort_order, uploaded_role, uploaded_by, created_at
  FROM reservation_photos;

-- 3) 자식 → 부모 순서로 제거. 부모를 먼저 지우면 CASCADE 로 사진이 사라진다.
DROP TABLE reservation_photos;
DROP TABLE reservations;

-- 4) 부모 교체
ALTER TABLE reservations_new RENAME TO reservations;

-- 5) 자식 재생성 + 복원 (FK 는 새 reservations 를 가리킨다)
CREATE TABLE reservation_photos (
  id             INTEGER PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  r2_key         TEXT NOT NULL UNIQUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  uploaded_role  TEXT NOT NULL CHECK (uploaded_role IN ('member', 'admin')),
  uploaded_by    TEXT REFERENCES members (id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO reservation_photos (
  id, reservation_id, r2_key, sort_order, uploaded_role, uploaded_by, created_at
)
SELECT id, reservation_id, r2_key, sort_order, uploaded_role, uploaded_by, created_at
  FROM _reservation_photos_backup;

DROP TABLE _reservation_photos_backup;

-- 6) 인덱스 재생성 — 0007/0005/0009 가 만들던 것 + FIFO 조회용 하나
CREATE INDEX idx_reservations_member
  ON reservations (member_id, status);
CREATE INDEX idx_reservations_item_status_qty
  ON reservations (item_id, status, qty);
CREATE INDEX idx_reservations_created_at
  ON reservations (created_at DESC);
CREATE INDEX idx_reservations_due
  ON reservations (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_reservations_item_status_created
  ON reservations (item_id, status, created_at);
CREATE INDEX idx_reservation_photos_reservation
  ON reservation_photos (reservation_id, sort_order);

-- 7) 기존 행의 group_id 역채움 — 원래 신청 묶음은 알 수 없으므로 행 하나가 한 그룹이다.
UPDATE reservations SET group_id = 'legacy-' || id WHERE group_id IS NULL;

-- 8) 기존 pending FIFO 강등
--    윈도우 함수 결과를 먼저 별도 테이블로 고정한다. UPDATE 가 진행되면서 status 가 바뀌면
--    같은 문장의 서브쿼리가 그 변경을 다시 볼 수 있기 때문이다(Halloween problem).
CREATE TABLE _reservation_demote AS
SELECT id
  FROM (
    SELECT r.id,
           COALESCE(SUM(r.qty) OVER (
             PARTITION BY r.item_id
             ORDER BY r.created_at, r.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS cum_before,
           r.qty,
           (SELECT i.total_qty - i.qty_repair
              FROM items i WHERE i.id = r.item_id)
           - (SELECT COALESCE(SUM(x.qty), 0)
                FROM reservations x
               WHERE x.item_id = r.item_id AND x.status = 'rented') AS budget
      FROM reservations r
     WHERE r.status = 'pending'
  )
 WHERE cum_before >= budget
    OR cum_before + qty > budget;

UPDATE reservations
   SET status = 'reserved',
       due_at = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE status = 'pending'
   AND id IN (SELECT id FROM _reservation_demote);

DROP TABLE _reservation_demote;
