-- D1(SQLite) 기준선 — Neon migrations/0001~0023 을 재생하지 않고 현재 최종 형태를 새로 작성한다
-- (PLAN_D1_이관.md §4). Neon 마이그레이션 히스토리는 삭제된 컬럼·테이블·롤백 과정을 포함하므로
-- 새 방언으로 replay 하는 대신 최종 상태만 옮긴다.
--
-- 방언 전환 규칙:
--   GENERATED ALWAYS AS IDENTITY  → INTEGER PRIMARY KEY (rowid 별칭)
--   TIMESTAMPTZ DEFAULT now()     → TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
--                                   — ISO 8601(ms, Z) 유지, JSON 응답 형태 무변경
--   vector(1024)                  → embedding BLOB (1024×f32 little-endian, 앱에서 직렬화)
--   GEN_RANDOM_UUID()             → lower(hex(randomblob(16)))
--   ALTER TABLE ADD CONSTRAINT (CHECK) → 테이블 정의에 인라인
-- 검색: pg_trgm GIN 인덱스(0022)는 FTS5 items_fts(trigram)로 대체 — 아래 끝부분.

CREATE TABLE IF NOT EXISTS members (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  phone          TEXT,              -- nullable — 로그인 시점엔 미수집, 프로필 입력에서 채움 (0003)
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),  -- 0013 2단계
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deactivated_at TEXT               -- NULL = 활성, 값 있으면 탈퇴(소프트 삭제) (0018)
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  total_qty   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  embedding   BLOB,                 -- 1024×f32 LE — bge-m3, NULL = 미생성 (0004)
  source_key  TEXT,                 -- 시트 재수입 멱등 키 'Y26-###' (0008)
  kind        TEXT NOT NULL DEFAULT 'rental' CHECK (kind IN ('rental', 'consumable')),  -- 0010
  location    TEXT,                 -- 시트 '위치' (0010)
  qty_broken  INTEGER NOT NULL DEFAULT 0 CHECK (qty_broken >= 0 AND qty_broken <= total_qty)  -- 0010
);

CREATE TABLE IF NOT EXISTS item_photos (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items (id),
  member_id   TEXT NOT NULL REFERENCES members (id),
  status      TEXT NOT NULL DEFAULT 'rented' CHECK (status IN ('rented', 'returned', 'cancelled')),  -- 0015 3종
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1)  -- 부분 대여 (0009)
);

-- 0020 — 카테고리(태그) 재도입 + 0021 다대다 전환
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS item_categories (
  item_id     INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);

-- 0023 — 로그인 허용 예외 이메일 (AUTH_ALLOWED_EMAILS env 의 DB 보조)
CREATE TABLE IF NOT EXISTS allowed_emails (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email      TEXT NOT NULL UNIQUE,  -- 앱에서 trim+lowercase 정규화 후 저장
  note       TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 인덱스 — 최종 형태에 남아 있는 것만 이식
-- (idx_items_category 는 0021 컬럼 삭제로 소멸, pg_trgm GIN 4종은 FTS5 로 대체)

-- 이력·마이페이지 조회용
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);

-- 가용성 판정 — "이 물품의 대여 중 수량 합" (0015)
CREATE INDEX IF NOT EXISTS idx_reservations_item_status_qty
  ON reservations (item_id, status, qty);

CREATE INDEX IF NOT EXISTS idx_item_categories_category
  ON item_categories (category_id);

-- 부분 유니크 — 기존 수동 등록 물품(source_key IS NULL)은 제약에서 제외 (0008)
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_key
  ON items (source_key) WHERE source_key IS NOT NULL;

-- FTS5 키워드 검색 — pg_trgm(0022) 대체. contentful 일반 테이블로 앱에서 동기화하고
-- rowid = items.id 로 저장해 조인 없이 바로 매핑한다 (PLAN §2 결정 2, §7.3).
-- tags 는 카테고리 이름 공백 조인 — embedItem 이 쓰는 텍스트 규칙과 동일.
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  name, description, location, tags,
  tokenize = 'trigram'
);
