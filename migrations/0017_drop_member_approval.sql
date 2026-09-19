-- 회원 승인(approved) 제거 — members.status = {active, inactive}
-- 로그인이 곧 가입이라 대기/승인 단계가 없다. 기존 pending/approved 는 전부 active 로
-- 통일하고, 기본값도 active 로 바꾼다 (자연 멱등 — 이미 둘 다 없으면 UPDATE 는 no-op,
-- DEFAULT 는 동일값 유지). status 에 CHECK 제약이 없어 ALTER 불필요.
UPDATE members SET status = 'active' WHERE status IN ('pending', 'approved');
ALTER TABLE members ALTER COLUMN status SET DEFAULT 'active';