-- 과거 대여 이력(참고용) — 2025 청년페스타 '물품대여' 시트 218행.
--
-- reservations 와 합치지 않고 별도 테이블로 두는 이유:
--   reservations 는 pending → approved → picked_up → returned 상태기계를 가진 '살아 있는
--   운영 큐'다. 관리자 대시보드가 CURRENT_DATE 기준으로 연체·반납 예정을 집계한다
--   (server/src/routes/admin/dashboard.ts:31-35). 이미 끝난 과거 기록을 같은 테이블에
--   넣으면 (1) item_id·member_id 가 NOT NULL FK 라 미매칭 건을 넣을 수 없고
--   (2) 과거 건이 전부 연체로 집계되며 (3) 운영 목록 상단을 과거 데이터가 차지한다.
--
-- 그래서 FK 를 강제하지 않는 스냅샷 테이블로 분리한다.
--   · item_id 는 best-effort 연결용이며 NULL 을 허용한다(매칭 실패가 정상 상태).
--   · 원본 시트의 '신청자'는 계정이 아니라 이름 문자열이다. members 는 OAuth 신원
--     테이블이므로 과거 신청자 이름을 계정으로 INSERT 하지 않는다 — member_name 에
--     스냅샷으로만 남긴다.
--   · 원본 행 전체는 커밋된 data/sheet-import/raw_festa.json 에 있고 source_row 로 찾을 수
--     있다(90MB xlsx 를 다시 받지 않고도 파싱 규칙을 재검토 가능). 같은 내용을 DB 에
--     jsonb 로 중복 저장하지 않는다.
CREATE TABLE IF NOT EXISTS rental_history (
    id serial PRIMARY KEY,
    source_key text NOT NULL,
    source_row integer,
    item_name text NOT NULL,
    item_id integer REFERENCES items (id) ON DELETE SET NULL,
    item_scope text,
    member_name text NOT NULL,
    org text,
    qty integer CHECK (qty IS NULL OR qty >= 1),
    requested_on date,
    start_at timestamp,
    end_at timestamp,
    use_location text,
    procurement text,
    checkout_state text,
    return_state text,
    return_location text,
    note text,
    internal_note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- source_key 로 멱등성을 보장한다 — 같은 시트를 여러 번 반영해도 중복이 쌓이지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_history_source_key ON rental_history (
    source_key
);

CREATE INDEX IF NOT EXISTS idx_rental_history_item_id ON rental_history (
    item_id
);

CREATE INDEX IF NOT EXISTS idx_rental_history_item_name ON rental_history (
    item_name
);

CREATE INDEX IF NOT EXISTS idx_rental_history_requested_on ON rental_history (
    requested_on
);
