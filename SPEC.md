# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

버전: v2.1 (2026-09-08) · 규모: 소규모 (물품 ~50개) · 대상: 지부 회원 (계정제) · 플랫폼: Cloudflare (호스팅·저장소) + Neon (PostgreSQL DB)

> **변경 이력**
> - v1.1 (2026-09-03): Supabase/Vercel → Cloudflare(Workers + D1 + R2) 전면 교체. 인증은 Auth.js로 자체 구현. 이메일은 Resend 유지.
> - v2.0 (2026-09-08): **클라이언트를 Hono JSX 서버 렌더링 → 순수 Lit SPA로 전면 교체.** 서버는 Hono JSON API 전용(JSX 렌더링 제거). 스타일은 Tailwind → Lit `css` 템플릿 + CSS 커스텀 프로퍼티 디자인 토큰(Shadow DOM 캡슐화 유지).
> - v2.1 (2026-09-08): **DB를 D1(SQLite) → Neon(PostgreSQL)으로 교체.** 연결은 `@neondatabase/serverless` HTTP 드라이버(fetch 기반, Workers 친화). 백업은 주간 `pg_dump` 주도로 변경. 런타임은 여전히 workerd — Deno는 패키지 매니저/개발 도구 역할.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 목적 | 청년지부 보유 물품(캠핑용품, 행사장비 등)의 대여 예약을 온라인으로 관리 |
| 이용자 | 지부 회원 (승인제) · 관리자 (운영진) |
| 물품 규모 | 약 50개, 카테고리 5~8개 |
| 예상 동시 이용자 | 동시 접속 수 명 수준 (지부 단위 소규모) |
| 운영 비용 | 월 0원 (Cloudflare 무료 티어 기반) |
| 운영 환경 | Cloudflare 대시보드 (호스팅·저장소·도메인) + Neon 콘솔 (DB) — 2곳 |
| 유지보수 | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱/서버 설치 불필요) |

## 2. 사용자 및 권한

| 역할 | 권한 |
|---|---|
| 미인증 방문자 | 물품 목록·상세 열람, 로그인 |
| 승인 대기 회원 | 마이페이지(승인 대기 상태 확인)만 접근 |
| 회원 (approved) | 물품 검색, 대여 신청, 내 예약 현황·이력 조회, 신청 취소 |
| 관리자 (admin) | 물품 등록/수정/삭제, 대여 신청 승인/거절, 수령·반납 처리, 회원 승인, 전체 대여 이력 조회 |

- 회원가입: 카카오 또는 구글 소셜 로그인(OAuth) → 가입 시 이름·연락처 입력 → 관리자 승인 후 이용 가능
- 로그인 세션: JWT 기반 무상태 세션 (DB 조회 없이 검증 — Workers 친화적)
- 관리자: DB의 role 필드로 지정 (최초 1~2명 수동 지정)

## 3. 대여 상태 흐름 (핵심 플로우)

```
[물품 상세] 대여 기간 선택 → 신청(pending)
   → 관리자 승인(approved) ── 거절(rejected)
   → 수령(picked_up)
   → 반납(returned)          ── 예약일 전 취소(cancelled)
   → 반납일 지연 시 연체(overdue) 표시
```

- **가용성 판정**: 신청한 기간과 상태가 `pending/approved/picked_up`인 예약 수량 합 < `items.total_qty` 이면 신청 가능
- **이중 예약 방지**: 가용 검사를 신청 INSERT와 한 문장으로 처리 (`INSERT ... SELECT ... WHERE 가용수량 > 0`) — Postgres 단일 문장은 원자적으로 실행되어 원자성 보장
- 승인 시점에 다른 예약과 겹치면 관리자에게 경고 표시
- 반납일 하루 전·연체 시 이메일 알림 (Workers Cron Trigger)

## 4. 기능 명세

### 4.1 회원
- 카카오 / 구글 OAuth 로그인 (Auth.js — 카카오 프로바이더 내장)
- 최초 로그인 후 프로필 입력: 이름, 연락처(휴대폰)
- 마이페이지: 대여 중 / 승인 대기 / 대여 예정 / 대여 이력 목록, 신청 취소
- 회원 탈퇴: 소프트 삭제 (대여 이력 보존을 위해 비활성화 처리)

### 4.2 물품
- 목록: 카테고리 필터 + 이름 검색, 대여 가능 여부 배지(대여 가능 / 대여 중 / 예약 있음)
- 상세: 사진(최대 3장), 설명, 보유 수량, 대여 규칙(기본 대여일 수 등), 실시간 가용 일정
- 관리자: 물품 등록/수정/삭제, 상태(정상/수리중/폐기) 관리, 사진 업로드(R2 — API 엔드포인트가 Workers R2 바인딩으로 직접 저장)

### 4.3 대여
- 신청: 날짜 범위 선택 → 겹침 검사 → 신청 (메모 입력 가능)
- 관리자 처리: 신청 목록에서 승인/거절(거절 사유 필수), 수령 체크, 반납 체크
- 연체: 반납일 경과 시 목록에 `연체` 배지 + 이메일 안내 (수동 반납 처리)
- 대여 기간 정책 파라미터화: 기본 7일, 설정 테이블에서 변경 가능

### 4.4 관리자
- 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수
- 회원 관리: 승인 대기 목록 → 승인/거절
- 이력: 물품별/회원별 대여 이력 조회 (엑셀 다운로드는 2차 범위)

### 4.5 알림 (이메일 — Resend 무료 티어)
| 시점 | 수신자 | 트리거 |
|---|---|---|
| 대여 신청 접수 | 관리자 | 신청 즉시 |
| 승인/거절 | 신청 회원 | 승인 즉시 |
| 반납일 하루 전 | 대여 회원 | Cron Trigger (매일 오전) |
| 연체 | 대여 회원 (+관리자) | Cron Trigger (매일 오전) |

> Resend 무료 한도: 100통/일 · 3,000통/월 — 소규모 지부 사용량에서 여유 충분
> Cloudflare 무료 플랜은 임의 주소 발송이 불가하므로 이메일 발송만 외부(Resend) 유지

## 5. SPA 화면·라우트 목록

클라이언트 라우팅은 SPA 내부(@vaadin/router, history API)에서 처리. 서버는 `/api/*`와 정적 자산만 응답.

| 경로 | 화면 | 접근 |
|---|---|---|
| `/` | 물품 목록 (카테고리·검색·가능 여부) | 전체 |
| `/items/:id` | 물품 상세 + 대여 신청 폼 | 전체 (신청은 회원) |
| `/mypage` | 내 예약 현황·이력 | 회원 |
| `/login` | 소셜 로그인 | 전체 |
| `/signup/profile` | 이름·연락처 입력 (최초 1회) | 로그인 회원 |
| `/policy/privacy` | 개인정보 처리방침 | 전체 |
| `/admin` | 대시보드 | 관리자 |
| `/admin/items` | 물품 관리 | 관리자 |
| `/admin/reservations` | 대여 신청 승인·수령·반납 | 관리자 |
| `/admin/members` | 회원 승인 관리 | 관리자 |

## 6. 기술 스택

| 계층 | 선택 | 근거 |
|---|---|---|
| 클라이언트 | **Lit 3 + TypeScript (SPA)** | 웹 표준 컴포넌트, 초경량(코어 ~6KB gzip), Shadow DOM 캡슐화, 모바일 성능 우수 |
| 클라이언트 빌드 | **Vite** | Lit 공식 툴체인, 빠른 HMR, Workers Static Assets 산출물 그대로 배포 |
| 클라이언트 라우팅 | **@vaadin/router** | history API 기반, Lit 생태계 표준, 라우트 가드 내장 |
| 상태 관리 | **@lit/context** (session, toast 2개) | 규모 대비 충분 — 외부 상태 라이브러리 불필요 |
| 스타일 | **Lit `css` 템플릿 + CSS 커스텀 프로퍼티 디자인 토큰** | Shadow DOM 캡슐화 유지 — Tailwind는 Shadow DOM과 충돌하여 제외 |
| 서버 | **Hono (JSON API 전용)** + TypeScript | Workers 네이티브, 라우팅·미들웨어만 사용 — JSX 렌더링 제거 |
| DB | **Neon** (PostgreSQL, 무료 플랜) + `@neondatabase/serverless` HTTP 드라이버 | 진짜 Postgres — 익숙한 문법·풍부한 타입, fetch 기반이라 Workers 무료 플랜에서 TCP/Hyperdrive 불필요 |
| 인증 | **Auth.js (@auth/core)** — 카카오/구글 OAuth + JWT 세션 (Hono 연동: hono-auth-js) | Workers 호환, 카카오 프로바이더 내장, HttpOnly 쿠키 |
| 이미지 저장 | **Cloudflare R2** (무료 10GB) | 이그레스 비용 0, S3 호환 |
| 배포 | **Wrangler CLI** (`wrangler deploy`) | Git 푸시 → GitHub Actions 자동 배포 |
| 정적 자산 | **Workers Static Assets** (`not_found_handling: single-page-application`) | SPA 폴백 내장 — Pages 불필요, 2026년 Cloudflare 공식 권장 |
| 이메일 | **Resend** (무료 플랜) | HTTP API 호출만으로 발송, 3,000통/월 무료 |
| 패키지 매니저 | **Deno 2** | npm 스펙으로 npm 생태계(Lit, Hono, Vite) 호환 |
| 언어 | 한국어 UI (i18n 불필요) | 이용자 전원 국내 회원 |

대안 비교: WordPress 플러그인(유지보수·보안 부담), 노코드(커스텀 대여 로직 한계), React/Vue SPA(번들·보일러플레이트 큼, 지부 규모엔 과함), Hono JSX SSR + Lit 아일랜드(템플릿 체계 2개 혼용으로 1인 유지보수 불리) → **Lit SPA + Hono API 단일 구조** 채택.

## 7. SPA 아키텍처

### 7.1 폴더 구조
```
web/src/
  app-shell.ts          — 헤더/하단 네비 + 라우터 아웃렛
  router.ts             — @vaadin/router 라우트 정의 + 가드
  styles/tokens.css     — 디자인 토큰 (CSS 커스텀 프로퍼티: 색·간격·타입)
  context/              — session-context, toast-context (@lit/context)
  api/                  — fetch 래퍼 (타입 정의, 401 처리, 에러 토스트)
  components/ui/        — badge, date-range-picker, availability-strip,
                          data-table, photo-uploader, toast 등 재사용 컴포넌트
  pages/                — home, item-detail, mypage, login, profile,
                          policy, admin/* 화면 컴포넌트
server/src/
  index.ts              — Hono 앱 (API 라우트 마운트)
  routes/               — items, reservations, admin, auth
  middleware/           — requireAuth, requireApproved, requireAdmin
  jobs/                 — Cron Trigger 일일 알림 배치
```

### 7.2 인증 플로우
1. SPA 로드 시 `GET /api/me`로 세션 확인 → `session-context`에 저장
2. 소셜 로그인은 SPA fetch가 아닌 **full-page redirect** (`/api/auth/signin/:provider` → OAuth → 콜백 후 SPA 복귀)
3. JWT는 **HttpOnly + Secure + SameSite=Lax 쿠키** — 클라이언트 JS가 토큰에 접근 불가 (XSS 완화)
4. API가 401 반환 → fetch 래퍼가 세션을 `null`로 갱신 → 라우트 가드가 `/login`으로 이동
5. 승인 대기(status=pending) 회원은 `/mypage`만 허용

### 7.3 라우트 가드
- `router.ts`에서 @vaadin/router guard로 경로별 검사:
  - `/mypage`, `/signup/profile` → 로그인 필요
  - `/admin/*` → 로그인 + `role='admin'` (아니면 안내 화면)
- 가드 판단 기준은 모두 `/api/me` 응답값 (서버 권한 검사는 §8 미들웨어가 이중으로 강제)

### 7.4 API 엔드포인트
| 메서드 | 경로 | 설명 | 권한 |
|---|---|---|---|
| GET | `/api/me` | 세션 사용자 (없으면 200 + `{user:null}`) | 전체 |
| * | `/api/auth/*` | Auth.js 표준 (signin/callback/signout) | 전체 |
| GET | `/api/categories` | 카테고리 목록 | 전체 |
| GET | `/api/items?category=&q=` | 물품 목록 + 가용 배지 | 전체 |
| GET | `/api/items/:id` | 상세 + 사진 + 점유 기간 목록(향후 90일, 회원 정보 제외) | 전체 |
| POST | `/api/reservations` | 대여 신청 (원자적 INSERT — §8) | approved |
| GET | `/api/reservations/mine` | 내 예약 현황·이력 | approved |
| POST | `/api/reservations/:id/cancel` | 신청 취소 | 본인 |
| GET/POST/PUT/DELETE | `/api/admin/items` | 물품 CRUD | admin |
| POST | `/api/admin/items/:id/photos` | 사진 업로드 → R2 바인딩 | admin |
| GET | `/api/admin/reservations?status=` | 전체 예약 목록 | admin |
| POST | `/api/admin/reservations/:id/{approve,reject,pickup,return}` | 상태 처리 | admin |
| GET/POST | `/api/admin/members`, `/api/admin/members/:id/{approve,reject}` | 회원 승인 | admin |
| GET | `/api/admin/dashboard` | 오늘 수령/반납, 승인 대기, 연체 건수 | admin |

### 7.5 Wrangler 설정 (SPA 폴백 + API 분기)
```jsonc
{
  "main": "server/src/index.ts",
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",  // 모든 라우트 → index.html
    "run_worker_first": ["/api/*"]                     // API는 워커가 우선 처리
  }
}
```

### 7.6 날짜 선택·가용 UI (v1 범위)
- `date-range-picker`: 네이티브 `<input type="date">` 2개 + 기간 유효성 검사 (최소/최대 대여일, 과거 불가)
- `availability-strip`: 서버가 내려준 점유 기간을 향후 90일 막대로 시각화 (점유일/잔여 수량)
- 커스텀 캘린더 그리드(월간)는 v2 후보 — v1에서는 위 조합으로 충분

## 8. 데이터베이스 설계 (Neon / PostgreSQL)

```sql
-- PostgreSQL 16 (Neon) — migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',    -- member | admin
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | inactive
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | repair | retired
  total_qty   INTEGER NOT NULL DEFAULT 1,
  max_days    INTEGER NOT NULL DEFAULT 7,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_photos (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL,                     -- R2 오브젝트 키
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items (id),
  member_id   TEXT NOT NULL REFERENCES members (id),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | picked_up | returned | rejected | cancelled
  status_note TEXT,
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 가용성 판정(§3)과 이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_reservations_item_dates
  ON reservations (item_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('max_rental_days', '7')
ON CONFLICT (key) DO NOTHING;
```

**가용 수량 쿼리 (이중 예약 방지)**:
```sql
INSERT INTO reservations (item_id, member_id, start_date, end_date)
SELECT $1, $2, $3, $4
WHERE (
  SELECT items.total_qty - COUNT(*)
  FROM reservations, items
  WHERE reservations.item_id = $1
    AND items.id = $1
    AND reservations.status IN ('pending','approved','picked_up')
    AND reservations.start_date < $4::date
    AND reservations.end_date > $3::date
) > 0;
-- affected rows = 0 이면 기간 겹침 → 신청 거절 (API는 409 반환)
-- 단일 문장이라 원자적 — 동시 신청에도 이중 예약 불가
```

**연결 방식**: `@neondatabase/serverless` HTTP 드라이버 (fetch 기반) — Workers 무료 플랜에서 동작, TCP/Hyperdrive 불필요. HTTP 모드는 무상태이므로 요청마다 클라이언트를 생성해도 안전. `DATABASE_URL`은 배포 시 `wrangler secret put`, 로컬 개발은 `.dev.vars`/.env로 관리.

**권한 처리 (애플리케이션 레벨)**: Hono 미들웨어에서 통일 강제 —
- `requireAuth`: 세션 JWT 검증
- `requireApproved`: `status='approved'` 회원만 예약 API 접근
- `requireAdmin`: `role='admin'`만 `/api/admin/*` 라우트 접근
- 모든 예약 쿼리에 `WHERE member_id = :session_user` 조건 필수 (관리자 제외)
- 클라이언트 라우트 가드(§7.3)는 UX일 뿐 — 실제 권한은 전부 서버에서 검사

## 9. 비기능 요구사항

1. **개인정보 최소 수집**: 이름·연락처만 수집. 수집 목적·보관 기간 명시한 개인정보 처리방침 페이지 필수. 연락처는 대여 연락 목적으로만 사용.
2. **보안**: OAuth 시크릿·Resend API 키·R2 토큰은 Workers Secrets (`wrangler secret put`)로 관리. JWT는 서명 검증, HttpOnly 쿠키 저장, SPA JS 접근 차단. 관리자 API는 미들웨어에서 role 검사 (§8).
3. **번들 예산**: 초기 로드 gzip 150KB 이하 (Lit 코어 ~6KB 포함). 이미지는 R2에서 지연 로딩.
4. **반응형**: 모바일 우선 (대여 신청은 휴대폰에서 이루어질 것으로 가정). 하단 탭 네비 등 모바일 앱형 내비게이션.
5. **브라우저 지원**: 모던 브라우저 최신 2버전 (Chrome, Safari, Samsung Internet — Shadow DOM 기본 지원 범위).
6. **백업**: Neon 무료 플랜 PITR 창은 짧아(시간 단위) 유일한 수단으로 부적합 → **주 1회 GitHub Actions에서 `pg_dump` 실행**, 덤프를 비공개 아티팩트로 보관 (주요 백업 수단).
7. **가용성**: Workers는 일시정지 개념 없음. Neon 무료 플랜은 ~5분 유휴 후 컴퓨트 일시정지 → 재요청 시 수백 ms 콜드스타트 (지부 규모 체감 미미 — 인수). 저장 0.5GB·월 컴퓨트 시간도 필요량 대비 여유 — 대시보드에서 사용량 모니터링.
8. **백업 검증**: 분기 1회 덤프 복원 테스트로 백업 유효성 확인.

## 10. 무료 티어 한계 검증 (2026-09 기준, 공식 문서 확인)

| 서비스 | 무료 한도 | 본 서비스 필요량 | 판정 |
|---|---|---|---|
| Workers Free | 요청 100,000/일, CPU 10ms/요청 | 지부 규모 일 수백 요청 | ✅ 여유 |
| Neon Free | 저장 0.5GB · 월 컴퓨트 ~190시간 · 5분 유휴 일시정지 | 데이터 수십 KB, 간헐적 접속 | ✅ 여유 (유휴 콜드스타트 인수) |
| Neon Free | PITR 창 짧음 (시간 단위) | 주간 pg_dump로 보완 | ⚠️ 보완 필요 |
| R2 Free | 저장 10GB · Class A 100만/월 · Class B 1,000만/월 · 이그레스 무료 | 사진 50개 물품 × 3장 ≈ 수백 MB | ✅ 여유 |
| Cron Triggers | 무료 플랜 포함 (계정당 3개) | 1개 사용 (일일 알림 배치) | ✅ |
| Resend Free | 100통/일, 3,000통/월 | 월 최대 수십 통 수준 | ✅ 여유 |

**총 운영 비용: 월 0원** (커스텀 도메인 사용 시 연 약 2만원 선택 · Cloudflare 무료 플랜은 비영리 제한 없음)

## 11. 개발 마일스톤

| 단계 | 내용 | 기간 |
|---|---|---|
| 1 | Cloudflare 셋업(R2 생성) + Neon 프로젝트 생성(가까운 아시아 리전), 카카오/구글 OAuth 앱 등록, Vite+Lit 스캐폴드, Hono API 골격, Auth.js 로그인 + `/api/me`, 회원 승인 플로우 | 1주차 |
| 2 | 물품 관리 API + R2 사진 업로드, 물품 목록/상세 Lit 컴포넌트 (availability-strip 포함) | 2주차 |
| 3 | 대여 신청 (date-range-picker + 원자적 INSERT), 승인/수령/반납 관리자 화면 | 3주차 |
| 4 | Cron Trigger + Resend 이메일 알림, 마이페이지, 관리자 대시보드, 개인정보 처리방침 | 4주차 |
| 5 | GitHub Actions 배포 자동화, 실물 데이터 입력, 회원 테스트, 오픈 | 5주차 |

## 12. 향후 확장 (v2 후보)

- QR 코드로 수령/반납 처리 (관리자 스마트폰)
- 물품별 대여 통계 대시보드
- 카카오톡 알림톡 (유료 대체 검토 시)
- 물품 예약 캘린더 뷰 (월간 그리드 — §7.6)
- Cloudflare Access로 운영진 관리자 페이지 이중 보호
- 중고 거래 게시판 등 지부 커뮤니티 기능
- PWA (오프라인 캐시, 홈 화면 추가)

---

*본 사양서 승인 후 개발 착수. 변경 사항은 이 문서에 버전을 올려 기록.*
