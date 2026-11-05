# 07 — 서버와 클라이언트

서버·웹·공유 모듈의 디렉터리 지도와 SQL 위치, API 계약, batch, 재고 일관성 같은 레이어 규칙.

## 디렉터리

```
server/src/
  index.ts            — Hono 앱 (라우트 마운트, 사진 서빙, SPA 폴백)
  types.ts / db.ts    — 바인딩 타입 / D1 Sql 어댑터 (query·batch)
  auth.ts             — 로그인 설정 (구글 계정, 허용 이메일, 세션 쿠키)
  embedding.ts        — 검색용 임베딩 생성 + 캐시
  image-size.ts       — 의존성 없는 이미지 헤더 파서 (업로드 검사)
  photo-upload.ts     — 사진 업로드 공통 검증 (형식·용량·픽셀)
  middleware/auth.ts  — requireAuth · requireAdmin
  routes/             — items, categories, me, reservations + admin/*
  services/           — SQL과 도메인 로직 (SQL은 여기에만 존재)

web/src/
  main.tsx            — 앱 진입점·401 처리
  router.tsx          — 경로 매칭·가드·리다이렉트·스크롤 복원
  context/session.ts  — /api/me 세션 캐시·refresh
  api/client.ts       — fetch 래퍼·ApiError
  styles/             — tokens.css(디자인 값 단일 출처) · tailwind.css
  components/         — layout · ui(재사용) · common · features · admin
  pages/              — 화면 단위
  utils/              — 날짜·재고·사진·카테고리·확인 모달

shared/api-types.ts   — 서버·웹이 함께 쓰는 API 타입 계약
shared/stock.ts       — 재고 3영역·신청 가능·예약 가능 수량 계산 (서버·웹 공용)
shared/photo-limits.ts — 사진 장수·크기 한도
migrations-d1/        — D1 스키마 마이그레이션 (현재)
data/sheet-import/    — 시트 물품 원장과 반영 리포트 (생성물 포함)
server/tests/         — 단위 테스트(가짜 DB) + 실 SQLite 통합 테스트
server/scripts/       — 시드·시트 반영 SQL 생성기, 로컬 개발 런처
```

## 레이어 규칙

- **SQL은 `server/src/services/`에만 둔다.** 라우트는 HTTP 파싱·검증·응답만 한다.
- **계약은 `shared/api-types.ts`가 소유한다.** 서버 응답 타입과 웹 소비 타입을 한 곳에서
  정의해 드리프트를 컴파일 타임에 잡는다.
- **웹은 `web/src/api/client.ts`를 통해서만 서버를 호출한다.** 페이지가 `fetch`를 직접
  쓰지 않는다.
- **마이그레이션은 추가만 한다.** `migrations-d1/`의 기존 파일을 고치지 않고 새 번호를
  붙인다. 로컬·운영 모두 같은 순서로 적용한다.
- **여러 문장은 batch로 묶는다.** 물품 등록·수정처럼 태그·검색 색인이 함께 바뀌는 작업은
  하나의 트랜잭션이어야 한다. D1 batch에서 0행은 오류가 아니므로, 조건부 INSERT 두 개를
  나누지 말고 한 문장으로 처리한다.
- **재고 계산은 한 규칙으로** — `shared/stock.ts`의 JS 계산과 `reservations.service.ts`의
  SQL 가드가 같은 식(`rented + pending ≤ R`, `reserved ≤ R`, `newCap`/`queueCap`)을 쓴다.
  한쪽만 바꾸면 화면과 서버 판정이 어긋난다.
- **디자인 값은 `web/src/styles/tokens.css`가 단일 출처다.** 컴포넌트에 hex를 쓰지 않는다.
