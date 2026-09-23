-- 로그인 시점에는 연락처를 아직 수집하지 않음 (프로필 입력은 최초 로그인 후)
-- signIn 콜백의 INSERT (email, name)이 NOT NULL 제약에 걸리지 않도록 nullable로 완화
ALTER TABLE members ALTER COLUMN phone DROP NOT NULL;
