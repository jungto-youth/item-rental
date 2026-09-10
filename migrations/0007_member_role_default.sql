-- v2.10: 신규 회원 INSERT가 0001의 구 기본값 'member'로 들어가 members_role_check에 걸리는 문제 수정.
-- 0006이 기존 행의 role만 user로 이관하고 컬럼 DEFAULT를 바꾸지 않아 발생.
ALTER TABLE members ALTER COLUMN role SET DEFAULT 'user';
