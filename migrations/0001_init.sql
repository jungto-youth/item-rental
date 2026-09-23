--  — Neon (PostgreSQL) 초기 스키마 = "베이스 스냅샷"
-- migrate.ts 는 _migrations 에 적용 이력을 남기고 각 파일을 딱 한 번만 실행한다. 이 파일은 그 첫 번째라
-- 새 DB 는 여기서 스키마가 시작되지만, 이미 적용된 DB 에서는 다시 실행되지 않는다 — 본문을 고쳐도
-- 실제 스키마는 바뀌지 않는다(스키마 변경은 항상 새 번호 파일로 **추가**한다).
-- 여기 없는 것(= 이후 파일이 만들거나 지운 것): categories(0005 삭제)·settings(0014 삭제),
-- items.category_id(0011)·max_days(0015 — 기간 개념 제거)·size/color/note(0016),
-- reservations.start_date/end_date/status_note(0015), members.status(0018 — deactivated_at 대체),
-- members.phone 의 NOT NULL(0003 에서 해제).
-- 최종 스키마 = 이 파일 + 0002~0018 순차 적용. 신규 DB 경로는 2026-09-20 임시 스키마에 18개를 순서대로
-- replay 해 public 과 구조가 같은 것을 확인했다(Neon dev 브랜치를 새로 만들면 같은 검증이 자동으로 된다).
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  total_qty   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_photos (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items (id),
  member_id   TEXT NOT NULL REFERENCES members (id),
  status      TEXT NOT NULL DEFAULT 'rented',
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 이력·마이페이지 조회용 인덱스
-- (idx_reservations_item_dates 는 0015 가 날짜 컬럼과 함께 제거 — 0015 가 대체 인덱스를 만든다)
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);