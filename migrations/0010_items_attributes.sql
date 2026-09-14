-- P1 — 실물 데이터가 드러낸 누락 속성. 시트에는 있는데 items에 없던 값들이다.
--
-- kind       대여품/소모품 구분. 소모품 14건 + 일회용 마스크·물티슈·젓가락·스푼·상비약은
--            반납 흐름(picked_up → returned)이 의미 없다 — 나가면 재고가 줄 뿐이다.
-- category   (제거 — 사용자 결정. 분류 없이 검색으로 탐색한다. 0005 방향과 동일)
-- location   시트 '위치' 컬럼. 물건 찾기가 곧 위치인데 스키마에 아예 없었다.
--            (2025 참고 시트에는 '위치번호' 체계까지 있었다 — 복원 후보)
-- size/color 조끼 6그룹 ~20행이 색상×사이즈로 갈린다. Y26-099/Y26-100(녹회색)은 사이즈가
--            이름에 없어 2행으로 쪼개져 있고, Y26-106~109(연두 스탭조끼)는 L/XL/2XL/3XL이
--            원본 시트의 사이즈 칸에만 있었다. 이름 문자열에서 빼내 별도 컬럼으로 둔다.
-- qty_broken status가 물품 전체 단위라 '수신기 77개 중 7개만 수리중'을 표현할 수 없었다.
--            Y26-113 불량 수신기 7개가 별도 물품 행으로 존재하는 이유다.
--            실제 대여가능 = total_qty - qty_broken.
-- note       시트 '비고/특이사항'. description(사용자 노출 설명)과 분리해 보존한다.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS kind       TEXT NOT NULL DEFAULT 'rental',
  ADD COLUMN IF NOT EXISTS location   TEXT,
  ADD COLUMN IF NOT EXISTS size       TEXT,
  ADD COLUMN IF NOT EXISTS color      TEXT,
  ADD COLUMN IF NOT EXISTS qty_broken INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note       TEXT;

-- kind는 두 값만 허용한다. 재실행 안전을 위해 DROP + ADD를 한 문장으로 처리한다
-- (migrate.ts는 추적 테이블 없이 매번 전체를 재실행한다).
ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_kind, ADD CONSTRAINT chk_items_kind CHECK (kind IN ('rental', 'consumable'));

-- qty_broken은 0 이상이며 total_qty를 넘을 수 없다 (넘으면 대여가능이 음수가 된다).
ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_qty_broken, ADD CONSTRAINT chk_items_qty_broken CHECK (qty_broken >= 0 AND qty_broken <= total_qty);

-- 검색(name/description ILIKE '%…%')과 location·note 키워드 매칭은 인덱스를 붙이지 않는다.
-- 154건 규모에서 seq scan이 더 싸고, '%…%' 패턴은 btree가 못 쓰며 text_pattern_ops도
-- 접두 매칭에만 통한다. 임베딩(pgvector)이 의미 검색을 담당한다.
