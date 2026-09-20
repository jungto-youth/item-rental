-- 회원 활성/비활성 상태 제거 — members.status {active, inactive} → deactivated_at
-- v3.1 이후 status 는 'active'=가입 시 기본값 / 'inactive'=관리자 탈퇴 처리(소프트 삭제)뿐이다.
-- 활성 상태는 어차피 전원의 기본값이라 화면에서 항상 동일하게 표시될 뿐인 잡음이고,
-- 남은 의미는 '탈퇴 여부' 하나이므로 status 컬럼을 통째로 빼고 탈퇴 시각만 남긴다.
--   * deactivated_at IS NULL  → 활성 회원
--   * deactivated_at IS NOT NULL → 탈퇴(소프트 삭제 — 대여 이력 보존은 유지)
--
-- 러너가 _migrations 에 적용 이력을 남기므로 이 파일은 '딱 한 번' 적용된다. 그래서 기존
-- inactive 회원을 백필(UPDATE)하고 나서 status 를 지우는(DROP COLUMN) 순서가 안전하다.
-- (이전의 '매번 전체 재실행' 러너였다면 백필이 status 를 읽다가 재실행 시 죽었을 것이다.)
ALTER TABLE members ADD COLUMN deactivated_at timestamptz;
UPDATE members SET deactivated_at = now() WHERE status = 'inactive';
ALTER TABLE members DROP COLUMN status;