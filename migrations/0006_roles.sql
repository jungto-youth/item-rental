-- v2.7: 역할 3단계 — admin(총관리자) > manager(관리자) > user(회원)
-- 기존 member 값을 user로 이관. 기존 admin은 그대로 총관리자가 된다.
UPDATE members SET role = 'user' WHERE role = 'member';

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN ('user', 'manager', 'admin'));
