# ARCHITECTURE.md — 구조

제품 규칙은 [SPEC.md](SPEC.md), 실행·테스트는 [DEVELOPMENT.md](DEVELOPMENT.md),
배포·DB 운영은 [OPERATIONS.md](OPERATIONS.md)를 본다.

## 1. 한눈에

```
브라우저
  │
  ├─ /api/*  ──→ Cloudflare Worker (Hono)
  │                ├─ middleware/auth  ── requireAuth · requireAdmin
  │                ├─ routes/*         ── HTTP 경계
  │                ├─ services/*       ── SQL·도메인 로직
  │                └─ D1 (DB) · R2 (PHOTOS) · Workers AI (AI)
  │
  └─ 그 외   ──→ Static Assets (web/dist, SPA 폴백)
```

서버와 클라이언트는 같은 Worker에서 나간다. `assets.directory`가 `web/dist`를 서빙하고,
`run_worker_first`가 `/api/*`만 Worker로 먼저 보낸다. 나머지 경로는 SPA 폴백으로
`index.html`을 돌려준다.

## 2. 기술 스택

| 계층 | 기술 | 비고 |
| --- | --- | --- |
| 호스팅 | Cloudflare Workers | 무료 플랜, Static Assets로 SPA 서빙 |
| 서버 | Hono 4 | JSON API (라우팅·미들웨어) |
| 클라이언트 | Solid 2 + TypeScript | SolidJS SPA (`web/`) |
| 빌드 | Vite | `web/dist` 산출물을 그대로 배포 |
| DB | Cloudflare D1 (SQLite) | 바인딩 호출 — 서버리스 HTTP 왕복 없음 |
| 검색 | FTS5 + Workers AI (`bge-m3`) | 키워드·부분 일치·의미 검색을 합쳐 랭킹 |
| 이미지 | Cloudflare R2 | 사진 저장·서빙 (이그레스 0원) |
| 인증 | Auth.js (`@auth/core`) | 구글 로그인 + HttpOnly 쿠키 세션 |
| 도구 | Node 24+ (npm · Vitest · TypeScript) | |

## 3. 요청 흐름

1. **API** — `/api/*`는 `guardApiRequest`(보안 헤더·오리진 검사)를 거쳐 도메인 라우트로
   들어간다. 라우트는 `requireAuth` / `requireAdmin`으로 권한을 확인하고 서비스 함수를
   호출한다. 서비스만 SQL을 실행한다.
2. **사진** — `/api/photos/*`는 R2 키 형식을 검증하고 `requireAuth`로 최신 회원 상태를
   확인한 뒤 스트리밍한다. 물품 사진은 활성 회원 모두, 반납 사진은 본인·관리자만 볼 수 있다.
   물품 사진은 키가 업로드마다 새 UUID라 `private, max-age=86400`로 캐시하고, 반납 사진은
   `private, no-store`로 저장하지 않는다.
3. **인증** — `/api/auth/*`는 Auth.js가 전담한다. 로그인 성공 시 `members`에 upsert하고,
   JWT의 `sub`를 `members.id`로 바꾼다. 이후 모든 권한 판단은 이 ID로 한다.
4. **SPA** — 그 외 경로는 `web/dist`의 정적 파일, 없으면 `index.html`이다.
   클라이언트 라우터(`web/src/router.tsx`)가 경로·가드·리다이렉트·스크롤 복원을 맡는다.

## 4. 디렉터리

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

web-lit/src/          — 옮기기 전 Lit 앱 (deprecated, Shadow DOM)
shared/api-types.ts   — 서버·웹이 함께 쓰는 API 타입 계약
shared/stock.ts       — 재고 3영역·신청 가능·예약 가능 수량 계산 (서버·웹 공용)
shared/photo-limits.ts — 사진 장수·크기 한도
migrations-d1/        — D1 스키마 마이그레이션 (현재)
data/sheet-import/    — 시트 물품 원장과 반영 리포트 (생성물 포함)
server/tests/         — 단위 테스트(가짜 DB) + 실 SQLite 통합 테스트
server/scripts/       — 시드·시트 반영 SQL 생성기, 로컬 개발 런처
```

## 5. 레이어 규칙

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

## 6. 데이터

D1 테이블은 `migrations-d1/`이 정의한다. 주요 축은 다음과 같다.

| 영역 | 테이블 | 비고 |
| --- | --- | --- |
| 회원 | `members`, `allowed_emails` | 역할 `user`/`admin`, 소속(`affiliation`), 탈퇴·등록 정보 삭제 상태 |
| 물품 | `items`, `item_photos` | 생애주기 `active`/`retired`, 수량 상태 `total_qty`·`qty_repair` |
| 분류 | `categories`, `item_categories` | 다대다 |
| 대여 | `reservations` | 신청 대기(`pending`)·예약(`reserved`)·대여 중·반납·취소·거절, `group_id`, 반납 예정일(`due_at`), 승인·거절 처리자 |
| 반납 사진 | `reservation_photos` | 반납 시점 상태 사진(최대 3장), 회원·관리자 첨부 구분, 본인·관리자만 열람 |
| 검색 | `items_fts` (FTS5) | 키워드 색인, 임베딩은 `items`에 저장 |

- 물품 상태 배지는 `available` · `reserved` · `unavailable` · `rented` · `repair` · `retired`
  다. `retired`는 관리자 목록에서만 보인다. `reserved`는 "예약 신청 가능", `unavailable`은
  "신청 마감"이다.
- 소모품(`consumable`)은 재고가 줄기만 하고 대여 기간 개념이 없다.

### 6.1 대여 상태와 재고

```
R        = total_qty - qty_repair
rented + pending <= R
신규 reserved <= R

newCap   = max(0, R - rented - pending - reserved)   // 신규가 지금 받을 수 있는 양
queueCap = max(0, R - reserved)                      // 신규가 예약할 수 있는 양

신청 N: N <= R, N <= newCap + queueCap
  now  = min(N, newCap)  -> pending
  wait = N - now         -> reserved (due_at NULL)
```

```
신청 ─┬─ pending  (재고 있음) ─┐
      └─ reserved (재고 없음) ─┴─→ 관리자 승인 → rented → returned
                                  → rejected / cancelled
```

- 한 신청은 최대 두 행(`pending`/`reserved`)이 되고 같은 `group_id`로 묶인다.
- `pending`은 신청 시 재고를 점유하고, `reserved`는 점유하지 않는다.
- 승인 가드: `pending`은 `qty + rented ≤ R`, `reserved`는 `qty + rented + pending ≤ R`.
- 자동 승격(`reserved → pending`)과 부분 배정은 v1 범위 밖이다. 승인 시점이 배정 시점이다.

## 7. 검색

검색은 세 랭킹을 RRF(Reciprocal Rank Fusion)로 합친다.

1. **키워드** — 3글자 이상이면 FTS5
2. **부분 일치** — 1~2글자는 `LIKE` 폴백
3. **의미** — Workers AI `bge-m3` 임베딩의 코사인 유사도 (API 키 불필요)

의미 후보는 유사도가 뭉쳐 있어(0.4~0.65) 절대 임계로 무관한 결과를 거를 수 없다. 키워드(1·2)로
맞은 물품이 하나도 없고 의미 후보만 남으면 응답에 `similar: true`를 내리고, 회원 검색 화면이
"정확히 맞는 물품이 없어 비슷한 물품을 보여줍니다"를 띄운다. 관리자 목록은 클라이언트 필터라
해당하지 않는다.

DB에 직접 넣은 물품은 임베딩이 없다. 관리자 세션으로 `POST /api/admin/reembed-all`을
끝날 때까지 반복 호출해 채운다.

## 8. 구현체

| 경로 | 역할 | 상태 |
| --- | --- | --- |
| `web/` | 배포하는 SolidJS SPA | 운영 |
| `web-lit/` | 옮기기 전 Lit 앱 | deprecated |

`web/`은 `web-lit/`과 화면·문구·API 계약이 같고 렌더링 기반만 다르다.

- Shadow DOM 대신 Tailwind v4 유틸리티 클래스를 쓴다. 토큰은 `tokens.css` 한 벌이다.
- Lit 라우터 대신 `web/src/router.tsx`가 경로 매칭·가드·리다이렉트·스크롤 복원을 맡는다.
- 세션은 `/api/me` 캐시·세대 번호·401 처리 규약을 그대로 옮겼다.
- 사진은 업로드 전 1600px·2MB로 축소한다. 물품 사진과 반납 사진 모두 최대 3장이다.

`web-lit/`은 사진 파이프라인·시각 회귀 기준선이 남아 있어 비교용으로만 유지한다.
배포에는 쓰지 않는다.
