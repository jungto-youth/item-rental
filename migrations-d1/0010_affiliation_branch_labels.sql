-- 0010 — 소속 표기에서 '지회'를 뺀다.
--
-- 저장 형식은 그대로 "지회명 · 모둠"이지만 지회명을 "서울지회"에서 "서울"로 바꾼다.
-- 회원 프로필과 대여 신청 시점 스냅샷을 함께 정규화해 관리자 화면의 표기가
-- 과거/현재로 갈라지지 않게 한다. 자유 입력 등 다른 값은 건드리지 않는다.

UPDATE members
   SET affiliation = REPLACE(affiliation, '서울지회 · ', '서울 · ')
 WHERE affiliation LIKE '서울지회 · %';

UPDATE members
   SET affiliation = REPLACE(affiliation, '경기지회 · ', '경기 · ')
 WHERE affiliation LIKE '경기지회 · %';

UPDATE members
   SET affiliation = REPLACE(affiliation, '남부지회 · ', '남부 · ')
 WHERE affiliation LIKE '남부지회 · %';

UPDATE reservations
   SET member_affiliation_snapshot = REPLACE(member_affiliation_snapshot, '서울지회 · ', '서울 · ')
 WHERE member_affiliation_snapshot LIKE '서울지회 · %';

UPDATE reservations
   SET member_affiliation_snapshot = REPLACE(member_affiliation_snapshot, '경기지회 · ', '경기 · ')
 WHERE member_affiliation_snapshot LIKE '경기지회 · %';

UPDATE reservations
   SET member_affiliation_snapshot = REPLACE(member_affiliation_snapshot, '남부지회 · ', '남부 · ')
 WHERE member_affiliation_snapshot LIKE '남부지회 · %';
