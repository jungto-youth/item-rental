# 청년지부 물품 대여 사이트

정토회 청년지부의 물품(대여품·소모품) 대여 관리 사이트. 회원은 물품을 검색해 기간과 수량을 골라 신청하고, 관리자가 승인·수령·반납을 처리한다.

사양서는 [SPEC.md](SPEC.md), 디자인 규칙은 [DESIGN.md](DESIGN.md)를 본다.

## 기술 스택

| 계층            | 기술                                          | 비고                                                  |
| --------------- | --------------------------------------------- | ----------------------------------------------------- |
| 호스팅          | Cloudflare Workers                            | 무료 플랜, Static Assets로 SPA 서빙                   |
| 서버            | Hono 4                                        | Workers 네이티브 JSON API (라우팅·미들웨어)           |
| 클라이언트      | Lit 3 + TypeScript                            | Shadow DOM 캡슐화 웹 컴포넌트 SPA                     |
| 클라이언트 빌드 | Vite                                          | `web/dist` 산출물을 그대로 배포                       |
| 라우팅·상태     | @vaadin/router · @lit/context                 | history API 라우트 가드 / session·toast 컨텍스트      |
| DB              | Neon (PostgreSQL 16)                          | `@neondatabase/serverless` HTTP 드라이버 (fetch 기반) |
| 검색            | Cloudflare Workers AI `@cf/baai/bge-m3`       | pgvector `vector(1024)` 의미 검색, API 키 불필요      |
| 이미지          | Cloudflare R2                                 | 사진 저장 + 이그레스 0 — `/api/photos/*`로 서빙       |
| 인증            | Auth.js                                       | 구글 OAuth + JWT 세션 (HttpOnly 쿠키)                 |
| 배포            | Wrangler CLI                                  | `deno task deploy`                                    |
| 패키지 관리     | Deno 2 (태스크·DB 스크립트) · npm 호환 패키지 |                                                       |

운영 비용은 월 0원 (모두 무료 티어 이내).

## 역할

| 역할             | 권한                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| 회원 (`user`)    | 물품 검색, 대여 신청, 내 예약 현황·이력 조회, 신청 취소                                                    |
| 관리자 (`admin`) | 물품 등록/수정/삭제·사진 관리, 대여 승인/거절, 수령·반납 처리, 회원 승인, 전체 이력 조회, 관리자 지정/해제 |

- 로그인은 `@jungto.org` 계정만 허용하고, 예외는 `AUTH_ALLOWED_EMAILS` 시크릿에 콤마로 나열한다.
- 관리자 지정/해제는 관리자 누구나 가능하다. **마지막 관리자는 본인 포함 해임·비활성화 불가**, 승인 대기·비활성 회원은 관리자로 임명 불가 (서버가 409로 강제).
- 첫 관리자는 DB에서 수동 지정한다: `UPDATE members SET role = 'admin' WHERE email = '...'`

## 프로젝트 구조

```
server/src/
  index.ts                — Hono 앱 (라우트 마운트, /api/photos/* R2 서빙, SPA 폴백)
  types.ts / db.ts        — Bindings·SessionUser 타입 / Neon HTTP 드라이버 초기화
  auth.ts                 — Auth.js 설정 (구글 OAuth, 이메일 제한, JWT)
  dates.ts / embedding.ts / image-size.ts — KST 날짜 계산 / 임베딩 / 이미지 검사
  middleware/auth.ts      — requireAuth / requireApproved / requireAdmin
  routes/                 — items, me, reservations, admin/{items,members,reservations,dashboard,history}
  services/               — SQL·도메인 로직 (items, reservations, members, dashboard, history, search)
web/src/
  main.ts / app-shell.ts / router.ts — 부트스트랩 / 헤더·네비 셸 / 라우트 정의·가드
  styles/tokens.css       — CSS 커스텀 프로퍼티 디자인 토큰 (+ 다크)
  context/session.ts      — /api/me 캐시
  api/client.ts           — fetch 래퍼 (401 처리, 에러 토스트)
  components/ui/          — badge, availability-strip, x-calendar
  utils/photo.ts          — 사진 리사이즈·업로드 (1600px WebP)
  pages/                  — home, item-detail, mypage, login, signup-profile, policy, admin/*
migrations/               — Neon 마이그레이션 SQL (0001~0013, 순차 실행·멱등)
server/scripts/           — migrate, seed, reembed, import-items, import-rentals (Deno)
```

## 주요 API

| 메서드              | 경로                                                         | 설명                                          | 권한     |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------- | -------- |
| GET                 | `/api/me`                                                    | 세션 사용자 (없으면 200 + `{user:null}`)      | 전체     |
| *                   | `/api/auth/*`                                                | Auth.js 표준 (signin/callback/signout)        | 전체     |
| PUT                 | `/api/me/profile`                                            | 이름·연락처 입력                              | 로그인   |
| GET                 | `/api/items?q=`                                              | 물품 목록 + 가용 배지 — `q` 생략 시 전체 목록 | 전체     |
| GET                 | `/api/items/:id`                                             | 상세 + 사진 + 향후 90일 점유 일정             | 전체     |
| POST                | `/api/reservations`                                          | 대여 신청 (advisory 락 트랜잭션, 원자적)      | approved |
| GET                 | `/api/reservations/mine`                                     | 내 예약 현황·이력 (그룹 목록)                 | approved |
| POST                | `/api/reservations/:id/cancel`                               | 신청 취소 (수령 전만)                         | 본인     |
| GET                 | `/api/photos/*`                                              | R2 사진 서빙 (1년 캐시)                       | 전체     |
| GET/POST/PUT/DELETE | `/api/admin/items`                                           | 물품 CRUD (등록/수정 시 임베딩 자동 생성)     | admin    |
| POST/DELETE         | `/api/admin/items/:id/photos[/:photoId]`                     | 사진 업로드(1600px·2MB 검사)·삭제             | admin    |
| GET                 | `/api/admin/reservations?status=`                            | 전체 예약 목록 (수량 합계·겹침 배지)          | admin    |
| POST                | `/api/admin/reservations/:id/{approve,reject,pickup,return}` | 상태 처리 (거절은 사유 필수)                  | admin    |
| GET/POST            | `/api/admin/members`, `/:id/{approve,reject,deactivate}`     | 회원 목록·승인/거절/비활성화                  | admin    |
| PUT                 | `/api/admin/members/:id/role`                                | 역할 지정/해제 (마지막 관리자 보호)           | admin    |
| GET                 | `/api/admin/dashboard`                                       | 오늘 수령/반납, 승인 대기, 연체 건수          | admin    |
| GET                 | `/api/admin/history?q=&scope=&page=&limit=`                  | 과거 대여 이력 (시트 스냅샷, 참고용)          | admin    |

## 대여 상태 흐름

```
[물품 상세] 기간·수량 선택 → 신청(pending)
   → 관리자 승인(approved) ── 거절(rejected, 사유 필수)
   → 수령(picked_up)
   → 반납(returned)          ── 수령 전 취소(cancelled)
   → 반납일 경과 시 연체(overdue) 배지
```

- **대여 가능 수량** `rentable_qty = total_qty - qty_broken` (수리중 수량은 재고에서 제외)
- 신청 기간의 **매 대여일**마다 `pending/approved/picked_up` 예약의 `SUM(qty)` + 신청 수량 ≤ `rentable_qty` 이면 신청 가능
- 반개구간 `[start, end)` — 반납일은 대여일에서 제외. 당일 반납 불가, 붙어 있는 예약은 충돌이 아니다
- 물품별 `pg_advisory_xact_lock` 트랜잭션이 동시 신청을 직렬화해 이중 예약을 막는다 (HTTP 드라이버는 요청마다 별도 세션)
- 이메일 알림은 없다. 연체는 목록·마이페이지의 계산 배지로만 표시한다

## 검색

- **키워드**: 공백 구분 단어 AND — 이름·설명·보관 위치 ILIKE
- **의미**: 쿼리 임베딩 → pgvector 코사인 거리 상위 8개(거리 < 0.75)를 키워드 결과 뒤에 추가
- 임베딩은 물품 등록/수정 시 자동 생성, 실패하면 키워드 검색만으로 폴백
- 검색어가 없으면 폐기(`retired`) 물품을 뺀 전체 목록을 보여준다

## DB 스키마 (요약)

`members` · `items` · `item_photos` · `reservations` · `rental_history` · `settings` — 전체 DDL과 가용성 쿼리는 [SPEC.md](SPEC.md) §6.

## SPA 라우트

| 경로                                               | 화면                                                 | 접근               |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------ |
| `/`                                                | 물품 목록 (검색·가용 배지) — 관리자 등록 버튼 포함   | 전체               |
| `/items/:id`                                       | 물품 상세 + 대여 신청 (관리자는 편집·사진 관리)      | 전체 (신청은 회원) |
| `/login`, `/signup/profile`                        | 로그인 / 프로필 입력                                 | 전체               |
| `/mypage`                                          | 내 예약 그룹 목록 (대여 중/승인 대기/대여 예정/이력) | 회원               |
| `/policy/privacy`, `/policy/terms`                 | 개인정보 처리방침·이용약관                           | 전체               |
| `/admin` · `/admin/{reservations,history,members}` | 대시보드 · 대여 관리 · 이력 · 회원 관리              | admin              |
| `(.*)`                                             | 404 화면                                             | 전체               |

## 무료 티어 한계

| 서비스     | 한도                                                   | 판정    |
| ---------- | ------------------------------------------------------ | ------- |
| Workers    | 100,000 요청/일, CPU 10ms/요청                         | ✅ 여유 |
| Neon       | 0.5GB 스토리지, ~190시간 컴퓨트/월 (5분 유휴 일시정지) | ✅ 여유 |
| R2         | 10GB, 이그레스 무료                                    | ✅ 여유 |
| Workers AI | bge-m3 무료 모델 (속도 제한)                           | ✅ 여유 |

## 개발

```bash
deno install          # 의존성 설치 (package.json 기준 → node_modules)

# 개발 (터미널 2개)
deno task dev:api     # wrangler dev → localhost:8787
deno task dev:web     # vite        → localhost:5173 (/api 는 8787 로 프록시)

deno task check       # 타입 검사 (web + server)
deno task build       # vite build → web/dist
deno task deploy      # vite build && wrangler deploy

# DB (server/scripts/*.ts)
deno task db:migrate         # migrations/*.sql 순차 적용 (멱등)
deno task db:seed            # 더미 데이터
deno task db:reembed         # 임베딩 백필 — DB 직접 INSERT 뒤 필수
deno task db:import-items    # 실물 시트 물품 일괄 반영
deno task db:import-rentals  # 과거 대여 이력(rental_history) 적재
```

`deno task` 목록은 `deno task`(인자 없이)로 확인한다. 작업 디렉터리는 `deno.json`이 있는 루트다.

주의: DB 스크립트는 **`.env`** 를, `wrangler dev`는 **`.dev.vars`** 를 읽는다. 둘 다 `DATABASE_URL`이 필요하니 같은 DB를 가리키게 맞춰 둔다 (두 파일 모두 git 추적 제외).

### 환경 변수 (`.dev.vars` / `wrangler secret put`)

| 변수                                    | 용도                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`                          | Neon 연결 문자열 (`postgresql://...`)                 |
| `AUTH_SECRET`                           | Auth.js JWT 서명 시크릿                               |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 구글 OAuth 클라이언트                                 |
| `AUTH_ALLOWED_EMAILS`                   | 로그인 허용 예외 이메일 (콤마 구분, `@jungto.org` 외) |

## 라이선스

Copyright © 2026 정토회. All rights reserved.
