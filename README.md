# 청년지부 물품 대여 사이트

## 사양

### 기술 스택

| 계층 | 기술 | 비고 |
|---|---|---|
| 호스팅 | **Cloudflare Workers** | 무료 플랜, 일시정지 개념 없음 |
| 프레임워크 | **Hono** (JSON API) | Workers 네이티브, 라우팅·미들웨어만 사용 |
| 클라이언트 | **Lit 3 + TypeScript** (SPA) | 웹 표준 컴포넌트, Shadow DOM 캡슐화 |
| 클라이언트 빌드 | **Vite** | 빠른 HMR, Workers Static Assets 산출물 그대로 배포 |
| 라우팅 | **@vaadin/router** | history API 기반, 라우트 가드 내장 |
| 상태 관리 | **@lit/context** | session, toast 컨텍스트만 |
| DB | **Neon** (PostgreSQL, 무료) | `@neondatabase/serverless` HTTP 드라이버 (fetch 기반) |
| 임베딩 | **Cloudflare Workers AI** `@cf/baai/bge-m3` | 의미 검색 — pgvector `vector(1024)` |
| 이미지 | **Cloudflare R2** (무료 10GB) | 이그레스 비용 0 |
| 인증 | **Auth.js** — 구글 OAuth + JWT 세션 | HttpOnly 쿠키, 무상태 |
| 이메일 | **Resend** (무료) | 알림 발송 (100통/일, 3,000통/월) |
| 스케줄 | **Cron Triggers** | 매일 오전 10시 반납·연체 알림 배치 |
| 배포 | **Wrangler CLI** (`wrangler deploy`) | GitHub Actions 자동 배포 연동 |
| 패키지 매니저 | **Deno 2** | npm 스펙으로 npm 생태계 호환 |
| 운영 비용 | **월 0원** | Cloudflare 무료 + Neon 무료 + R2 무료 |

### 프로젝트 구조

```
server/src/
  index.ts              — Hono 앱 (API 라우트 마운트)
  types.ts              — Bindings, SessionUser 공용 타입
  db.ts                 — Neon HTTP 드라이버 초기화
  auth.ts               — Auth.js 설정
  routes/
    items.ts            — 물품 목록/상세 + 키워드·의미 검색
    me.ts               — 내 정보, 프로필(이름·연락처) 입력
    admin/items.ts      — 물품 CRUD + 사진 업로드/삭제
  middleware/           — requireAuth, requireApproved, requireAdmin
  embedding.ts          — Workers AI @cf/baai/bge-m3 임베딩 생성
web/src/
  app-shell.ts          — 헤더/하단 네비 + 라우터 아웃렛
  router.ts             — @vaadin/router 라우트 정의 + 가드
  styles/tokens.css     — CSS 커스텀 프로퍼티 디자인 토큰
  context/              — session-context, toast-context
  api/                  — fetch 래퍼 (401 처리, 에러 토스트)
  components/ui/        — badge, availability-strip
  pages/                — home, item-detail, mypage, login, signup-profile, not-found, admin/items
migrations/             — Neon 마이그레이션 SQL (0001_init ~ 0005)
```

### 주요 API 엔드포인트

| 메서드 | 경로 | 설명 | 권한 |
|---|---|---|---|
| GET | `/api/me` | 세션 사용자 | 전체 |
| `*` | `/api/auth/*` | Auth.js (signin/callback/signout) | 전체 |
| GET | `/api/items?q=` | 물품 목록 (키워드+의미 검색) | 전체 |
| GET | `/api/items/:id` | 물품 상세 + 가용 일정 (향후 90일) | 전체 |
| PUT | `/api/me/profile` | 이름·연락처 프로필 입력 | 로그인 |
| GET/POST/PUT/DELETE | `/api/admin/items` | 물품 CRUD (임베딩 자동 생성) | admin |
| POST | `/api/admin/items/:id/photos` | 사진 업로드 → R2 | admin |
| DELETE | `/api/admin/items/:id/photos/:photoId` | 사진 삭제 (R2 + DB) | admin |
| GET | `/api/photos/*` | R2 사진 서빙 (1년 캐시) | 전체 |

### 대여 상태 흐름

```
[물품 상세] 신청(pending) → 관리자 승인(approved) / 거절(rejected)
→ 수령(picked_up) → 반납(returned) / 예약일 전 취소(cancelled) / 반납지연(overdue)
```

**가용성 판정**: `pending/approved/picked_up` 상태 예약 합 < `items.total_qty` 이면 신청 가능.  
**이중 예약 방지**: `INSERT ... SELECT ... WHERE 가용수량 > 0` 단일 문장으로 원자적 처리.

### 검색 (v2.3)

- **키워드 매치**: 공백 구분 단어 AND — 이름·설명 ILIKE (정확 검색 우선)
- **의미 검색**: 쿼리 임베딩 → pgvector 코사인 거리 상위 8개 (거리 < 0.75), 키워드에 없는 물품만 추가
- **임베딩 모델**: Workers AI `@cf/baai/bge-m3` (다국어, 무료, 1024차원)
- 실패 시 키워드 검색만 폴백 (물품 키워드 검색은 항상 동작)

### DB 스키마 (Neon / PostgreSQL 16)

```sql
members   — id, email, name, phone(nullable), role, status, created_at
items     — id, name, description, status, total_qty, max_days, embedding(vector(1024)), created_at
item_photos — id, item_id, r2_key, sort_order
reservations — id, item_id, member_id, start_date, end_date, status, member_memo, admin_id, created_at, updated_at
settings  — key, value
```

### SPA 라우트

| 경로 | 화면 | 접근 |
|---|---|---|
| `/` | 물품 목록 (검색·가용 배지) | 전체 |
| `/items/:id` | 물품 상세 + 대여 신청 | 전체 (신청은 회원) |
| `/login` | 소셜 로그인 | 전체 |
| `/mypage` | 내 예약 현황·이력 | 회원 |
| `/signup/profile` | 이름·연락처 입력 | 로그인 회원 |
| `/admin/items` | 물품 관리 | 관리자 |
| `(.*)` | 404 화면 | 전체 |

### 무료 티어 한계 (2026-09 기준)

| 서비스 | 한도 | 판정 |
|---|---|---|
| Workers | 100,000 요청/일, CPU 10ms | ✅ 여유 |
| Neon | 0.5GB, ~190시간 컴퓨트/월 | ✅ 여유 (5분 유휴 일시정지) |
| R2 | 10GB, 이그레스 무료 | ✅ 여유 |
| Cron | 3개/계정 | ✅ (1개 사용) |
| Resend | 100통/일, 3,000통/월 | ✅ 여유 |

**총 운영 비용: 월 0원**

### 버전

- **v2.6** (2026-09-09): 등록 저장 1회 클릭 완료 — 사진 사전 선택, id 발급 후 업로드, 실패 시 편집 유지
- **v2.5** (2026-09-09): 카테고리 완전 제거 — 검색(키워드+의미)으로 탐색 대체
- **v2.4** (2026-09-09): 카테고리 완전 제거 + 의미 검색 도입 (Workers AI + pgvector)
- **v2.3** (2026-09-09): 사용자 프로필에 연락처(phone) 필드 추가
- **v2.2** (2026-09-08): 구글 OAuth 로그인 + 세션 미들웨어 + 프로필 입력
- **v2.1** (2026-09-08): 물품 CRUD + 사진(R2) + 배포 설정
- **v1.0** (2026-09-08): init — Lit SPA + Hono + Neon 스캐폴딩

## 개발

```bash
# 개발 (병행 실행)
deno task dev:web   # Vite dev server (localhost:5173)
deno task dev:api   # Wrangler dev (localhost:8787)

# 빌드 & 배포
deno task build     # Vite build → web/dist
deno task deploy    # vite build && wrangler deploy

# DB
deno task db:migrate   # 마이그레이션 실행
deno task db:seed      # 더미 데이터 생성
deno task check        # TypeScript 타입 검사 (web + server)
```

## 라이선스

Copyright © 2026 정토회. All rights reserved.
