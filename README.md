# 청년지부 물품 대여 사이트

정토회 청년지부의 물품(대여품·소모품) 대여를 관리하는 사이트.
회원은 물품을 찾아 수량과 메모로 빌리고, 반납은 회원이 직접 하거나 관리자가 처리한다.

Cloudflare 위에서 동작하고 운영 비용은 월 0원이다. 앱·서버 설치 없이 웹 브라우저에서
모든 관리가 가능하다.

## 기능

| 역할   | 할 수 있는 것                                                          |
| ------ | ---------------------------------------------------------------------- |
| 방문자 | 로그인, 정책 열람                                                      |
| 활성 회원 | 물품 목록·상세·검색·사진, 대여 신청·취소·반납, 내 대여 현황, 프로필 편집 |
| 관리자 | 물품 등록·수정·사진, 반납 처리, 회원 탈퇴·역할 지정, 등록 정보 삭제, 로그인 허용 관리 |

**로그인이 곧 가입이다** — 구글 계정으로 처음 로그인하면 회원이 되고, 프로필(이름·연락처)을
입력하면 바로 이용한다. 정토회(`@jungto.org`) 계정과 관리자가 허용한 예외 계정이 로그인할 수 있다.

물품·카테고리·사진 API는 매 요청에 활성 회원 상태를 검사한다. 탈퇴 후 남은 세션도
조회할 수 없으며 사진과 목록 응답은 `private, no-store`로 제공한다. 새 사진 URL은 이전
공개 캐시와 분리하지만 이미 내려받은 파일까지 회수할 수는 없다.

회원 관리(`/admin/members`)의 **탈퇴**는 계정 접근을 차단하고 이력을 남긴다.
탈퇴 회원의 **등록 정보 삭제**는 대여 중인 물품이 없을 때만 가능하다. 이름·이메일·연락처를
제거하고 내부 ID와 완료된 대여·관리 이력은 익명으로 보존한다. 원래 이메일로 다음 로그인 시
새 일반 회원으로 등록된다. 마지막 활성 관리자는 탈퇴시킬 수 없다.

이 변경을 배포하기 전에 대상 환경에 맞춘
`npx wrangler d1 migrations apply <DB_NAME> --remote --config <CONFIG>`로
`0003_member_registration_deleted.sql`까지 적용한다. 로컬 검증은 `--local`을 사용한다.

## 핵심 규칙

이 앱에서 지켜야 할 불변식이다. 구현 세부는 각 파일의 주석과 테스트에 적어 두었다.

- **가용 수량** — 대여 가능 수량은 `전체 수량 − 수리중 수량`이다. 대여 중인 수량에 신청 수량을
  더해도 이 값을 넘지 않아야 한다.
- **이중 대여 방지** — 재고 검사와 상태 검사와 INSERT를 조건부 INSERT 한 문장으로 합쳤다.
  두 사람이 동시에 신청해도 하나만 성공한다.
- **여러 문장이면 batch** — 물품 등록·수정은 태그와 검색 색인 갱신까지 한 트랜잭션으로 묶는다.
  하나라도 실패하면 전부 롤백되어 없는 상태가 남지 않는다.
- **마지막 관리자 보호** — 마지막 남은 관리자는 해임하거나 탈퇴할 수 없다. 서버가 거부한다.
- **취소와 반납은 다르다** — 취소는 "빌리지 않기로 함", 반납은 "돌려줌". 둘 다 재고는 바로
  돌아오지만 이력에서 구분된다.
- **기간·연체 개념이 없다** — 신청하면 바로 대여 중이고, 반납 기한도 승인 절차도 없다.

## 기술 스택

| 계층       | 기술                                | 비고                                        |
| ---------- | ----------------------------------- | ------------------------------------------- |
| 호스팅     | Cloudflare Workers                  | 무료 플랜, Static Assets로 SPA 서빙         |
| 서버       | Hono 4                              | JSON API (라우팅·미들웨어)                  |
| 클라이언트 | Lit 3 + TypeScript                  | Shadow DOM 웹 컴포넌트 SPA                  |
| 빌드       | Vite                                | `web/dist` 산출물을 그대로 배포             |
| DB         | Cloudflare D1 (SQLite)              | 바인딩 호출 — 서버리스 HTTP 왕복 없음       |
| 검색       | FTS5 + Workers AI (`bge-m3`)        | 키워드·부분 일치·의미 검색을 합쳐 랭킹      |
| 이미지     | Cloudflare R2                       | 사진 저장·서빙 (이그레스 0원)               |
| 인증       | Auth.js (`@auth/core`)              | 구글 로그인 + HttpOnly 쿠키 세션           |
| 도구       | Node 24+ (npm · Vitest · TypeScript) |                                            |

검색은 키워드(3글자 이상 FTS5), 부분 일치(1~2글자 LIKE 폴백), 의미(임베딩 코사인) 세
랭킹의 결과를 RRF로 합쳐 정렬한다. API 키는 필요 없다.

## 프로젝트 구조

```
server/src/
  index.ts            — Hono 앱 (라우트 마운트, 사진 서빙, SPA 폴백)
  types.ts / db.ts    — 바인딩 타입 / D1 Sql 어댑터 (query·batch)
  auth.ts             — 로그인 설정 (구글 계정, 허용 이메일, 세션 쿠키)
  embedding.ts        — 검색용 임베딩 생성 + 캐시
  image-size.ts       — 의존성 없는 이미지 헤더 파서 (업로드 검사)
  middleware/auth.ts  — requireAuth · requireAdmin
  routes/             — items, categories, me, reservations + admin/*
  services/           — SQL과 도메인 로직 (SQL은 여기에만 존재)
web/src/
  pages/              — 화면 단위 (탐색·상세·로그인·마이페이지·관리자)
  components/         — ui(재사용) + features(도메인) 컴포넌트
  api/ context/ utils/ styles/  — API 클라이언트, 세션, 헬퍼, 디자인 토큰
shared/api-types.ts   — 서버·웹이 함께 쓰는 API 타입 계약
migrations-d1/        — D1 스키마 마이그레이션 (기준선 이후 변경을 순서대로 적용)
server/tests/         — 단위 테스트(가짜 DB) + 실 SQLite 통합 테스트
server/scripts/       — 시드·시트 반영 SQL 생성기
```

API 목록은 `server/src/routes/`, 스키마 정의는 `migrations-d1/`를 본다.

## 디자인

화면 디자인은 pen.dev 캔버스에서 관리한다. 저장소에는 `.pen` 파일을 두지 않고 아래 공유 링크로 참조한다.

- 물품 대여 디자인: <https://app.pen.dev/s/d1wHShhvLZuU8_u6T_QR6I0nk5sOvrqsI2CFCYoEyas>

편집 권한이 있는 사람은 링크로 캔버스를 열어 수정하고, 코드 반영은 이 저장소의 PR로 한다.

## 개발

```bash
npm ci                # 의존성 설치

# 개발 (터미널 2개)
npm run dev:api       # API 서버 → localhost:8787
npm run dev:web       # 웹 빌드 감시 → 브라우저 새로고침으로 반영
npm run dev:web:hmr   # 개발 서버 → localhost:5173 (구글 콜백 등록 필요)
npm run dev:lan       # 같은 API 서버를 0.0.0.0 에 → 폰/태블릿에서 실물로 검증

npm run check         # 타입 검사 (웹 + 서버 + 테스트 + 스크립트)
npm test              # 테스트
npm run test:photos   # 사진 파이프라인 브라우저 테스트 (chromium 필요)
npm run test:members  # 회원 전용 이동·등록 정보 삭제 브라우저 테스트 (chromium 필요)
npm run build         # 빌드 → web/dist
npm run deploy        # 빌드 후 배포
```

`npm run dev`로 두 서버를 한 번에 띄울 수도 있다.

`dev:lan`은 같은 서버에 LAN 전용 플래그를 켠다. 이 플래그가 있어야 `/api/dev/login`이
동작해 계정 없이 로컬 관리자 세션을 만들 수 있다 — 공개 호스트나 일반 빌드에서는
플래그가 꺼져 있어 해당 경로가 404로 막힌다.

테스트는 세 층이다. 단위 테스트는 "어떤 SQL을 날리는가"를, 통합 테스트는 "그 SQL이 실제로
무슨 행동을 하는가"를 검증한다. 통합 테스트는 `migrations-d1/`의 실제 스키마를 메모리
SQLite에 올려 대여 가드·마지막 관리자 보호 같은 동시성 규칙을 확인한다. 브라우저 테스트는
실제 코덱과 multipart 요청으로 사진 축소·카메라 촬영 경로를 확인한다 — 브라우저가
필요하므로 CI가 아니라 로컬에서 `npx playwright install chromium` 후 `npm run test:photos`
로 수동 실행한다.

## DB 운영

로컬과 운영은 자동으로 다른 DB를 쓴다(로컬은 로컬 SQLite 파일, 운영은 원격 D1).

```bash
npm run db:seed                                  # 시드 SQL 생성
npx wrangler d1 execute item-rental-db --local --file=server/scripts/out/seed.sql

npx wrangler d1 migrations apply item-rental-db --local   # 스키마 적용

npm run db:import-items                          # 시트 물품 일괄 반영 SQL 생성
```

DB에 직접 넣은 물품은 검색용 임베딩이 없다. 관리자 세션으로
`POST /api/admin/reembed-all`을 끝날 때까지 반복 호출해 채운다.

백업은 D1 Time Travel(최근 30일 복구)이 기본이다.

## 환경 변수

`.dev.vars`(로컬) 또는 `wrangler secret put`(운영)에 둔다.

| 변수                                      | 용도                                             |
| ----------------------------------------- | ------------------------------------------------ |
| `AUTH_SECRET`                             | 세션 서명 시크릿                                 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`   | 구글 로그인 클라이언트                           |
| `AUTH_ALLOWED_EMAILS`                     | 로그인 허용 예외 이메일(콤마 구분) — 비상용 폴백 |

첫 관리자는 DB에서 직접 지정한다.

```sql
UPDATE members SET role = 'admin' WHERE email = '...';
```

## 라이선스

Copyright © 2026 정토회. All rights reserved.
