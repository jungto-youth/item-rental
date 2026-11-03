-- 0007 — 대여 승인제 (BACKLOG B-10)
--
-- 신청을 pending 으로 받고 관리자가 승인하면 rented 가 된다. 신청 시에는 재고를
-- 점유하지 않고, 승인 시점에 원자적으로 재고를 확인한다(신청만으로 다른 회원의
-- 대여를 막지 않는다). 거절은 rejected + 사유를 남긴다.
--
-- status CHECK 를 바꾸려면 SQLite 는 테이블 재작성이 필요하다. 기존 행은 그대로
-- 복사하고, 소속 스냅샷은 현재 프로필 값으로 역채운다(그 시점 값이 없으므로 최선).
--
-- 파일 전체는 D1 batch 한 트랜잭션으로 실행된다 — 중간 실패 시 전부 롤백된다.
ALTER TABLE members ADD COLUMN affiliation TEXT;

CREATE TABLE reservations_new (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items (id),
  member_id   TEXT NOT NULL REFERENCES members (id),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'rented', 'returned', 'cancelled', 'rejected')),
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
  -- 신청 시점의 소속 — 프로필을 나중에 바꿔도 신청 이력의 표기는 유지한다.
  member_affiliation_snapshot TEXT,
  -- 승인·거절을 처리한 관리자와 시각. 반납 처리자(admin_id)와 별개다.
  decided_by     TEXT REFERENCES members (id),
  decided_at     TEXT,
  rejected_reason TEXT
);

INSERT INTO reservations_new (
  id, item_id, member_id, status, member_memo, admin_id,
  created_at, updated_at, qty,
  item_name_snapshot, item_location_snapshot, returned_at, admin_memo, due_at,
  member_affiliation_snapshot, decided_by, decided_at, rejected_reason
)
SELECT
  id, item_id, member_id, status, member_memo, admin_id,
  created_at, updated_at, qty,
  item_name_snapshot, item_location_snapshot, returned_at, admin_memo, due_at,
  (SELECT affiliation FROM members WHERE members.id = reservations.member_id),
  NULL, NULL, NULL
FROM reservations;

DROP TABLE reservations;
ALTER TABLE reservations_new RENAME TO reservations;

CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_item_status_qty
  ON reservations (item_id, status, qty);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at
  ON reservations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_due
  ON reservations (due_at) WHERE due_at IS NOT NULL;
