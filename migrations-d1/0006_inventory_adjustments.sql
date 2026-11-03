-- 0006 — 재고 수량 조정 이력 (BACKLOG B-11)
--
-- 보유 수량을 '추가/망실/폐기'로 조정한 사실을 남긴다. 기존 물품 수정 폼은
-- total_qty 를 바로 덮어써서 "언제 왜 줄었는지"를 알 수 없었다. 이제 수량 변경은
-- 이 표에 한 행을 남기고, 대여 이력이 있는 물품 삭제도 막는다.
--
-- 수리 중 수량(qty_repair)은 이번 범위에서 기존 수정 폼이 계속 맡는다 — 이 표는
-- 보유 수량(total_qty)의 증감만 기록한다.
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items (id),
  kind             TEXT NOT NULL CHECK (kind IN ('add', 'lost', 'dispose')),
  qty              INTEGER NOT NULL CHECK (qty >= 1),
  total_qty_before INTEGER NOT NULL CHECK (total_qty_before >= 1),
  total_qty_after  INTEGER NOT NULL CHECK (total_qty_after >= 1),
  memo             TEXT,
  actor_id         TEXT NOT NULL REFERENCES members (id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_item
  ON inventory_adjustments (item_id, created_at DESC);
