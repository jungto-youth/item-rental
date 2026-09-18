-- SPEC §8 — Neon (PostgreSQL) 초기 스키마
-- 이 파일은 "매번 전체를 재실행"하는 migrate.ts 의 일부다. 실행되지 않는
-- CREATE TABLE IF NOT EXISTS 리터럴이므로 이 파일에 남긴 컬럼이 실제 스키마를 만들지
-- 않는다(기존 테이블 변경은 0003~0016 이 담당). 아래는 0016 시점의 최종 상태로 정리했다:
-- categories(0005 삭제)·settings(0014 삭제)과 category_id(0011)·max_days(0015)·
-- start_date/end_date/status_note(0015)는 죽었거나 치명 오류(INSERT INTO settings)를
-- 일으키므로 제거했다.
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