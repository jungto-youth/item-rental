-- 로그인 허용 예외 이메일 테이블 — AUTH_ALLOWED_EMAILS env 변수를 보조하는 정식 관리 수단
-- @jungto.org 가 아닌 계정(운영진 개인 gmail 등)을 로그인 허용하려면 지금까지 env 시크릿을
-- 고치고 재시작해야 했다. 어드민 화면에서 추가/제거할 수 있도록 DB로 옮기되, env 변수는
-- DB 장애 시에도 관리자가 로그인할 수 있는 비상용 폴백으로 남긴다 (auth.ts 참고).
-- email 은 앱 코드에서 trim+lowercase 정규화 후 저장한다 (members.email 과 동일 기준) —
-- UNIQUE 제약이 곧 로그인 시 조회 인덱스가 된다.
CREATE TABLE IF NOT EXISTS allowed_emails (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
