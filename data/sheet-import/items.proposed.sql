-- 자동 생성 초안 — 그대로 실행하지 말 것.
-- 처리방안이 '미정'이고 수량이 파악된 73건만 담았다.
-- 대여 대상이 아닌 항목(기념품/소모품/도서 등)은 실행 전에 삭제할 것.
-- description 은 사이즈/규격 + 비고를 합친 값이다. max_days 는 정책값 7.

INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('부처님 사진', '정토회관', 'active', 7, 7);  -- Y26-071 | 만배/불교
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('염주', '정토회관', 'active', 90, 7);  -- Y26-072 | 만배/불교
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('싱잉볼', '정토회관', 'active', 1, 7);  -- Y26-073 | 만배/불교
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('인도 전통사리', '정토회관', 'active', 1, 7);  -- Y26-074 | 만배/불교
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('싸인펜(10색)', '정토회관', 'active', 1, 7);  -- Y26-075 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('싸인펜(11색)', '정토회관', 'active', 1, 7);  -- Y26-076 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('색연필(12색)', '정토회관', 'active', 1, 7);  -- Y26-077 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('모나미 칼라펜(12색)', '정토회관', 'active', 1, 7);  -- Y26-078 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('테이프', '정토회관', 'active', 1, 7);  -- Y26-079 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('편지지,편지봉투', '정토회관', 'active', 1, 7);  -- Y26-081 | 사무용품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('신발주머니', '정토회관', 'active', 37, 7);  -- Y26-083 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('아일렛펀치', '정토회관', 'active', 1, 7);  -- Y26-084 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('아일렛', '정토회관', 'active', 1, 7);  -- Y26-085 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('테이프데크', '정토회관', 'active', 1, 7);  -- Y26-086 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 끈', '정토회관', 'active', 1, 7);  -- Y26-088 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('상장케이스 미사용품 ( 남색 / 분홍색 )', '정토회관', 'active', 7, 7);  -- Y26-090 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('패브릭 마카', '8색 / 정토회관', 'active', 12, 7);  -- Y26-091 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('간편한 일회용 대나무 젓가락', '15개 / 정토회관', 'active', 1, 7);  -- Y26-092 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('간편한 일회용 대나무 스푼', '15개 / 정토회관', 'active', 1, 7);  -- Y26-093 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('일회용 물티슈', '정토회관', 'active', 4, 7);  -- Y26-094 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('셀카봉', '정토회관', 'active', 1, 7);  -- Y26-095 | 소모품
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('밴프 코펠 세트 3-4인용 CE521', '혼합색상 / 정토회관', 'active', 1, 7);  -- Y26-096 | 스포츠/등산
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('에리파이어 알파인 버너 / 캠핑 백패킹 등산 차박 휴대 용 미니 강염 가스 원버너', '정토회관', 'active', 1, 7);  -- Y26-097 | 스포츠/등산
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('다이소 도시락통', '750ml / 정토회관', 'active', 2, 7);  -- Y26-098 | 스포츠/등산
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 조끼 (녹회색)', 'XL / 정토회관', 'active', 35, 7);  -- Y26-099 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 조끼 (녹회색)', '2XL / 정토회관', 'active', 31, 7);  -- Y26-100 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 조끼 (민트색)', 'M / 정토회관', 'active', 1, 7);  -- Y26-101 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 조끼 (민트색)', 'XL / 정토회관', 'active', 3, 7);  -- Y26-102 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 조끼 (민트색)', '2XL / 정토회관', 'active', 42, 7);  -- Y26-103 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('정토 PRESS 남색 조끼', '사이즈 몇? / 정토회관', 'active', 4, 7);  -- Y26-104 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('카키색 조끼 (2XL)', '2XL / 정토회관', 'active', 54, 7);  -- Y26-105 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('연두색 스탭조끼', 'L / 정토회관', 'active', 50, 7);  -- Y26-106 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('연두색 스탭조끼', 'XL / 정토회관', 'active', 29, 7);  -- Y26-107 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('연두색 스탭조끼', '2XL / 정토회관', 'active', 10, 7);  -- Y26-108 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('연두색 스탭조끼', '3XL / 정토회관', 'active', 10, 7);  -- Y26-109 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('청년대학생정토회 먹색 조끼', 'L / 정토회관', 'active', 37, 7);  -- Y26-110 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('수신기', '정토회관', 'active', 77, 7);  -- Y26-111 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('송수신기', '정토회관', 'active', 38, 7);  -- Y26-112 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('불량 수신기', '정토회관', 'repair', 7, 7);  -- Y26-113 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('이어폰', '정토회관', 'active', 92, 7);  -- Y26-114 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('이어마이크', '정토회관', 'active', 43, 7);  -- Y26-115 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('녹음기', '정토회관', 'active', 2, 7);  -- Y26-116 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('여권케이스', '정토회관', 'active', 107, 7);  -- Y26-117 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('우의', '정토회관', 'active', 9, 7);  -- Y26-118 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 역사학교 (내가 역사다!)', '정토회관', 'active', 1, 7);  -- Y26-119 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 경주역사기행 
(법륜스님과 함께하는 청년 경주역사기행)', '정토회관', 'active', 2, 7);  -- Y26-120 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 광주역사기행 (광주 5.18 역사기행)', '정토회관', 'active', 1, 7);  -- Y26-121 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 청춘역사톡톡 (내가 역사다!)', '정토회관', 'active', 1, 7);  -- Y26-122 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 청춘역사톡톡 
(법륜스님과 함께하는 청춘역사톡톡)', '정토회관', 'active', 1, 7);  -- Y26-123 | 역사기행
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('비접촉온도계', '정토회관', 'active', 1, 7);  -- Y26-124 | 의료보건
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('일회용 마스크', '정토회관', 'active', 6, 7);  -- Y26-125 | 의료보건
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('상비약', '정토회관', 'active', 1, 7);  -- Y26-126 | 의료보건
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('릴선', '정토회관', 'active', 1, 7);  -- Y26-128 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('HDMI to VGA 컨버터', '정토회관', 'active', 1, 7);  -- Y26-129 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('기가폰(강의용 마이크&스피커)', '정토회관', 'active', 3, 7);  -- Y26-130 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('노트북', '정토회관', 'active', 1, 7);  -- Y26-131 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('기가폰', '정토회관', 'active', 1, 7);  -- Y26-132 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('스피커(마이크 유선1개/무선 1개,리모컨,건전지,어뎁터)', '정토회관', 'active', 1, 7);  -- Y26-133 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('라벨기', '정토회관', 'active', 1, 7);  -- Y26-135 | 전자기기 등
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('PPT 프로젝터 포인터', '정토회관', 'active', 3, 7);  -- Y26-136 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('돗자리 ( 小-1인용 / 中-단체용 )', '정토회관', 'active', 5, 7);  -- Y26-138 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('접이식 의자', '정토회관', 'active', 1, 7);  -- Y26-139 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('폴라로이드 카메라', '정토회관', 'active', 1, 7);  -- Y26-140 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('감정카드', '정토회관', 'active', 2, 7);  -- Y26-141 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('탁구채', '정토회관', 'active', 2, 7);  -- Y26-142 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('스님용 방석', '정토회관', 'active', 1, 7);  -- Y26-147 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('굿프렌즈 조끼 ( 먹색, XL / 2XL / 3XL )', '정토회관', 'active', 9, 7);  -- Y26-148 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('정토회 조끼 (카키색, L / XL / 2XL)', '정토회관', 'active', 21, 7);  -- Y26-149 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('하루온 팩', '정토회관', 'active', 1, 7);  -- Y26-150 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('깃대봉 / 숫자판', '정토회관', 'active', 43, 7);  -- Y26-151 | 청년행사
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 경전대학 실천활동 (청년 경전대학 실천활동)', '정토회관', 'active', 1, 7);  -- Y26-152 | 행자원/불대/경전대
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 불교대학 실천활동 (청년 불교대학 실천활동)', '정토회관', 'active', 1, 7);  -- Y26-153 | 행자원/불대/경전대
INSERT INTO items (name, description, status, total_qty, max_days)
VALUES ('현수막 불교대학&경전대학 특별활동 
(청년 불교대학 & 경전대학 특별활동)', '정토회관', 'active', 1, 7);  -- Y26-154 | 행자원/불대/경전대
