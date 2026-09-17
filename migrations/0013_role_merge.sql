-- v3.2: 역할 2단계 — admin(관리자) > user(회원)
-- 3단계(admin > manager > user)를 2단계로 단순화. 기존 manager(관리자) 행은 admin으로 승격.
UPDATE members SET role = 'admin' WHERE role = 'manager';

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN ('user', 'admin'));