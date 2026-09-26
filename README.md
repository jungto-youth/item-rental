# 청년지부 물품 대여 사이트

정토회 청년지부의 물품(대여품·소모품) 대여 관리 사이트. 회원은 물품을 검색해 수량과 메모로 대여하고, 반납은 회원이 직접 또는 관리자가 처리한다.

**제품·시스템 사양(도메인 규칙, API, DB 스키마, 검색 설계)은 [SPEC.md](SPEC.md)를 본다.** 이 문서는 저장소를 돌리고 배포하는 방법만 다룬다.

## 기술 스택

| 계층            | 기술                                          | 비고                                                  |
| --------------- | --------------------------------------------- | ----------------------------------------------------- |
| 호스팅          | Cloudflare Workers                            | 무료 플랜, Static Assets로 SPA 서빙                   |
| 서버            | Hono 4                                        | Workers 네이티브 JSON API (라우팅·미들웨어)           |
| 클라이언트      | Lit 3 + TypeScript                            | Shadow DOM 캡슐화 웹 컴포넌트 SPA                     |
| 클라이언트 빌드 | Vite                                          | `web/dist` 산출물을 그대로 배포                       |
| 라우팅·상태     | @lit-labs/router · @lit/context               | history API 라우트 가드 / session 컨텍스트            |
| DB              | Cloudflare D1 (SQLite)                        | 바인딩 호출 — 서버리스 HTTP 왕복 없음                 |
| 검색            | FTS5 + Workers AI `@cf/baai/bge-m3`           | bm25 × LIKE 폴백 × 벡터 코사인 RRF 융합 — API 키 불필요 |
| 이미지          | Cloudflare R2                                 | 사진 저장 + 이그레스 0 — `/api/photos/*`로 서빙       |
| 인증            | Auth.js (@auth/core)                          | 구글 OAuth + JWT 세션 (HttpOnly 쿠키)                 |
| 패키지 관리     | Deno 2 (태스크·테스트) · npm 호환 패키지      |                                                       |

운영 비용은 월 0원 (모두 무료 티어 이내 — 한도 상세는 SPEC.md §9).

## 프로젝트 구조

```
server/src/
  index.ts                — Hono 앱 (라우트 마운트, /api/photos/* R2 서빙, SPA 폴백)
  types.ts / db.ts        — Bindings·SessionUser 타입 / D1 Sql 어댑터 (query/batch)
  auth.ts                 — Auth.js 설정 (구글 OAuth, 이메일 제한, JWT)
  embedding.ts            — bge-m3 임베딩 + isolate 벡터 캐시
  image-size.ts           — 의존성 없는 JPEG/PNG/WebP 헤더 파서 (업로드 픽셀 검사)
  middleware/auth.ts      — requireAuth(getSessionUser) / requireAdmin
  routes/                 — items, categories, me, reservations + admin/{items,categories,
                            members,allowed-emails,reservations,dashboard,reembed}
  services/               — SQL·도메인 로직 (검색은 search.service.ts)
web/src/
  main.ts / app-shell.ts / router.ts — 부트스트랩 / 헤더·네비 셸 / 라우트 정의·가드
  api/client.ts           — fetch 래퍼 (타임아웃, 401 처리, ApiError.code)
  context/session.ts      — /api/me 캐시 (세대 카운터로 응답 경합 처리)
  components/ui/          — badge, button, modal, empty, notice 등 재사용 컴포넌트
  components/features/    — item/, category/ 도메인 컴포넌트
  pages/                  — home, item-detail, my-rentals, mypage, login, signup-profile,
                            policy, admin/{dashboard,items,reservations,members,allowed-emails}
  styles/                 — tokens.css(디자인 토큰), controls.ts, motion.ts
  utils/                  — date, photo(리사이즈·업로드), confirm, categories(캐시)
migrations-d1/            — D1 스키마 마이그레이션 (0001_baseline이 현재 최종 형태)
shared/api-types.ts       — server·web 공유 API 계약 타입 (서비스 row 타입이 이 정의를 채택해 드리프트를 컴파일 타임에 잡는다)
migrations/               — Neon 시절 마이그레이션 0001~0023 (레거시 — D1 이관 완료, 참고용)
server/scripts/           — seed, import-items (Deno — D1용 SQL 생성), export-neon-to-d1 (이관용 레거시)
server/tests/             — 단위 테스트(Sql 스텁) + sqlite.integration_test.ts(실 SQLite)
PLAN/                     — PLAN_D1_이관.md (Neon → D1 이관 기록)
rules/ast-grep-rules/     — no-sql-in-code (SQL은 services 레이어에만)
```

## 개발

```bash
deno install          # 의존성 설치 (package.json 기준 → node_modules)

# 개발 (터미널 2개)
deno task dev:api     # wrangler dev → localhost:8787 (web/dist 를 서빙)
deno task dev:web     # vite build --watch → web/dist 자동 재빌드 (브라우저 새로고침으로 반영)
deno task dev:web:hmr # vite → localhost:5173 (/api 는 8787 로 프록시) — 구글 콜백 등록 필요

deno task check       # 타입 검사 (web + server)
deno task test        # 테스트 — 단위(Sql 스텁) + 통합(node:sqlite 메모리 DB, 실 마이그레이션 DDL)
deno task build       # vite build → web/dist
deno task deploy      # vite build && wrangler deploy
```

통합 테스트는 `migrations-d1/`의 실제 DDL을 메모리 SQLite에 그대로 올려 대여 가드·마지막 관리자 보호·물품 등록 원자성 같은 SQL 동작을 검증한다. 스텁 단위 테스트는 "어떤 SQL을 날리는가", 통합 테스트는 "그 SQL이 실제로 무슨 행동을 하는가"를 담당한다.

### DB 운영

로컬(`wrangler dev`)과 프로덕션은 **자동으로 다른 DB**를 쓴다 — 로컬은 로컬 D1 SQLite 파일, 배포는 원격 D1. 로컬에 시드를 넣으려면:

```bash
deno task db:seed            # 시드 SQL 생성 → server/scripts/out/seed.sql
npx wrangler d1 execute item-rental-db --local  --file=server/scripts/out/seed.sql

npx wrangler d1 migrations apply item-rental-db --local    # migrations-d1/ 적용 (--remote 도 동일)

deno task db:import-items    # 실물 시트 물품 일괄 반영 SQL 생성 → out/import-*.csv.sql
deno task db:export-neon     # (레거시) Neon 데이터 펌프 — D1 이관 전용으로 쓰였음
```

DB에 직접 INSERT한 물품은 임베딩이 없다 — Workers AI는 워커 안에서만 호출 가능하므로,
관리자 세션으로 `POST /api/admin/reembed-all`을 `next_after`가 `null`이 될 때까지 반복 호출해 백필한다.

### 환경 변수 (`.dev.vars` / `wrangler secret put`)

| 변수                                    | 용도                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `AUTH_SECRET`                           | Auth.js JWT 서명 시크릿                               |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 구글 OAuth 클라이언트                                 |
| `AUTH_ALLOWED_EMAILS`                   | 로그인 허용 예외 이메일 (콤마 구분) — 비상용 폴백. 정식 관리는 어드민 허용 이메일 페이지 |

시크릿은 위 4개뿐이다 (`DATABASE_URL`은 D1 이관으로 2026-09-23 삭제).

### 첫 관리자 지정

첫 관리자는 DB에서 수동 지정한다:

```sql
UPDATE members SET role = 'admin' WHERE email = '...';
```

이후 지정/해제는 관리자 화면에서 (마지막 관리자는 서버가 409로 보호 — SPEC.md §3).

## 라이선스

Copyright © 2026 정토회. All rights reserved.
