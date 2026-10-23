-- 재고·대여 스키마 재설계 — 수량 상태 축 분리 + 위치 정규화 + 반납 기한.
-- 설계 기록과 결정 근거는 이슈 #12 (§3~§4). 로컬 D1 사본(물품 97 / 대여 6)에 적용해 검증했다.
--
-- ① qty_broken → qty_repair: '고장'은 물품이 아니라 수리 중인 수량이다.
--    기존 CHECK(qty_broken >= 0 AND qty_broken <= total_qty)는 RENAME COLUMN 을 따라간다.
-- ② lifecycle 신설: 물품 단위 생애주기(active/retired). repair 를 여기 두지 않는 이유 —
--    '수리 중'은 물품의 생애주기가 아니라 수량의 상태다. status(active/repair/retired)를
--    없애면 "활성인데 수리 중 수량 0" 같은 모순이 스키마에 존재할 수 없다.
-- ③ updated_at: 수정 시각. ADD COLUMN 은 상수 DEFAULT 만 받아 strftime() 을 못 쓴다.
-- ④⑤ 이관은 status 가 살아 있을 때 해야 한다 — DROP COLUMN 뒤에는 같은 트랜잭션에서도
--    그 컬럼을 읽을 수 없다. 마지막에 지운다.
-- ⑥ 위치 정규화: 자유 텍스트 → locations 참조. API 는 계속 이름 문자열을 내려주므로
--    화면 표시부는 바뀌지 않는다. 물품이 붙은 위치의 삭제는 FK 기본(NO ACTION)이 막는다 —
--    지우려면 먼저 물품을 다른 위치로 옮겨야 한다(고아 위치 방지).
-- ⑦ due_at: 반납 기한. 연체는 저장하지 않고 파생한다(due_at < now).
--
-- 트랜잭션: BEGIN/COMMIT 을 쓰지 않는다 — D1(miniflare)은 SQL 레벨 트랜잭션을 거부한다.
-- wrangler 의 migrations apply 는 파일 전체를 한 번의 db.batch() 로 보내고, D1 batch 는
-- 원자적이다. 즉 이 파일의 문장들은 여전히 전부 성공하거나 전부 롤백된다.

-- ① 이름 정리
ALTER TABLE items RENAME COLUMN qty_broken TO qty_repair;

-- ② 생애주기 축 — repair 는 수량(qty_repair)으로 내려갔다
ALTER TABLE items ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'
  CHECK (lifecycle IN ('active', 'retired'));

-- ③ 수정 시각 — nullable 로 추가하고 아래에서 역채움
ALTER TABLE items ADD COLUMN updated_at TEXT;

-- ④ 데이터 이관 (status 가 아직 살아 있는 시점)
--    status='repair' 는 물품 전체가 수리 중이던 상태다 → 수리 수량 = 보유 수량으로 옮긴다.
--    이미 qty_repair 가 0 이 아닌 행은 그 값을 유지한다(수량 축이 더 정확하다).
UPDATE items SET
  lifecycle  = CASE WHEN status = 'retired' THEN 'retired' ELSE 'active' END,
  qty_repair = CASE WHEN status = 'repair' AND qty_repair = 0 THEN total_qty ELSE qty_repair END,
  updated_at = created_at;

-- ⑤ 물품 단위 status 제거
ALTER TABLE items DROP COLUMN status;

-- ⑥ 위치 정규화 — 지금 있는 7개 문자열을 그대로 행으로 만든다(층 분할 없음).
--    관리자가 나중에 이름을 다듬는다는 전제이고, 데이터 손실이 없다.
CREATE TABLE locations (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO locations (name)
  SELECT DISTINCT location FROM items WHERE location IS NOT NULL ORDER BY location;
ALTER TABLE items ADD COLUMN location_id INTEGER REFERENCES locations (id);
UPDATE items SET location_id = (SELECT l.id FROM locations l WHERE l.name = items.location);
ALTER TABLE items DROP COLUMN location;

-- ⑦ 대여 반납 기한 — 연체는 파생 값이라 저장하지 않는다
ALTER TABLE reservations ADD COLUMN due_at TEXT;
CREATE INDEX IF NOT EXISTS idx_reservations_due
  ON reservations (due_at) WHERE due_at IS NOT NULL;
