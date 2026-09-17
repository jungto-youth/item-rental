-- settings 테이블 제거 — 대여 기간 정책의 유일한 출처는 물품별 items.max_days(기본 7)다.
-- settings.max_rental_days 는 0001에서 만들기만 하고 서버·웹 어디서도 읽지 않아,
-- 운영자가 DB 값만 바꿔도 화면·검증에 반영되지 않는 죽은 스키마였다.
DROP TABLE IF EXISTS settings;
