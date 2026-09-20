-- 과거 대여 이력(rental_history) 기능 제거 — 0012에서 만든 스냅샷 테이블과 인덱스를 내린다.
-- 조회 전용 참고 자료였고(SPEC §4.4 '이력'), 운영 큐(reservations)와는 무관하다.
-- 원본 데이터는 data/sheet-import/raw_festa.json 에 남아 있어 필요하면 재구축 가능하다.
DROP TABLE IF EXISTS rental_history;