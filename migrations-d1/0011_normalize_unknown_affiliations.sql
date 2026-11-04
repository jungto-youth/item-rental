-- 0011 — 자유 입력 소속을 표준 표기로 정리하고, 해석할 수 없는 값은 비운다.
--
-- 0010 은 "서울지회 · 동부" 같은 이전 표준 표기만 바꿨다. 그 이전에 자유 입력으로
-- 저장된 값은 지회·모둠을 확정할 수 없으므로 NULL 로 되돌려, 해당 회원이 다음
-- 로그인 때 /signup/profile 에서 직접 선택하게 한다. (접근 가드가 안내)
--
-- 확실히 해석되는 두 값만 먼저 표준 표기로 바꾼다.

UPDATE members
   SET affiliation = '서울 · 서부'
 WHERE affiliation = '서울/서울서부';

UPDATE members
   SET affiliation = '서울 · 북부'
 WHERE affiliation = '청년지부 서울지회 서울북부모둠';

-- 표준 조합이 아닌 나머지(지회만 있거나 "개발" 같은 값)는 비운다.
UPDATE members
   SET affiliation = NULL
 WHERE affiliation IS NOT NULL
   AND affiliation NOT IN (
     '서울 · 동부', '서울 · 서부', '서울 · 남부', '서울 · 북부',
     '경기 · 동부', '경기 · 서부', '경기 · 남부', '경기 · 북부',
     '남부 · 충청', '남부 · 대전/광주', '남부 · 대구/경북', '남부 · 부산/경남'
   );

-- 대여 스냅샷은 신청 시점의 이력이라, 해석 가능한 값만 표준 표기로 맞춘다.
-- 해석할 수 없는 스냅샷은 과거 기록이므로 그대로 보존한다.
UPDATE reservations
   SET member_affiliation_snapshot = '서울 · 서부'
 WHERE member_affiliation_snapshot = '서울/서울서부';

UPDATE reservations
   SET member_affiliation_snapshot = '서울 · 북부'
 WHERE member_affiliation_snapshot = '청년지부 서울지회 서울북부모둠';
