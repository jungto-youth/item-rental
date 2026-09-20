# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

지부 회원(계정제)이 보유 물품을 검색해 수량과 메모로 대여하고, 관리자가 반납을 처리하는 소규모 서비스(물품 97개). Cloudflare(호스팅·저장소) + Neon(PostgreSQL) 위에서 동작한다.

현재 구현 상태는 [README.md](README.md)를 본다.

## 1. 프로젝트 개요

| 항목             | 내용                                                                |
| ---------------- | ------------------------------------------------------------------- |
| 목적             | 지부 보유 물품(캠핑용품, 행사장비 등)의 대여 예약을 온라인으로 관리 |
| 이용자           | 지부 회원 · 관리자(운영진)                                  |
| 물품 규모        | 97개 (대여품 93 · 소모품 4) — 카테고리(관리자 분류) + 검색으로 탐색           |
| 예상 동시 이용자 | 수 명 수준 (지부 단위 소규모)                                       |
| 운영 비용        | 월 0원 (Cloudflare·Neon 무료 티어)                                  |
| 운영 환경        | Cloudflare 대시보드(호스팅·저장소·도메인) + Neon 콘솔(DB) — 2곳     |
| 유지보수         | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱·서버 설치 불필요)      |

## 2. 사용자 및 권한

| 역할                    | 권한                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| 미인증 방문자           | 물품 목록·상세 열람, 로그인                                                      |
| 회원 (`user`)           | 물품 검색, 대여, 내 대여 현황·이력 조회, 대여 취소                               |
| 관리자 (`admin`)        | 물품 CRUD, 대여 반납 처리, 회원 탈퇴 처리, 관리자 지정/해제           |

- 가입: 구글 소셜 로그인 = 가입. 최초 로그인 시 `members` 자동 생성 → 프로필(이름·연락처) 입력 → 바로 이용. **승인 단계가 없다** — 로그인이 곧 회원이고 `@jungto.org` 도메인 게이트가 회원 심사를 대신한다
- 로그인 허용: `@jungto.org` 계정만. 예외는 `AUTH_ALLOWED_EMAILS` 시크릿에 콤마 구분으로 나열하고, 비허용 계정은 로그인 단계에서 거부한다
- 세션: JWT 무상태 — 서명 검증 후 `members` 1회 조회로 최신 role/deactivated_at 반영
- 역할 지정/해제: 관리자만 가능. 마지막 관리자는 본인 포함 해임·탈퇴 불가. 첫 관리자는 DB 수동 지정 1회

## 3. 대여 상태 흐름 (핵심 플로우)

```
[물품 상세] 수량·메모 입력 → 대여(rented)
   → 반납(returned)   ← 회원이 직접 누르거나 관리자가 처리
   → 취소(cancelled)  ← 빌리지 않기로 함
```

- **기간 개념이 없다**: 날짜·최대 대여일·승인 단계를 두지 않는다. 회원이 수량과 메모만으로 신청하면 **즉시 대여 중**이 되고, 관리자는 물품을 돌려받았을 때 반납만 누른다
- **가용성 판정**: 대여 가능 수량은 `rentable_qty = total_qty - qty_broken` (수리중 수량은 재고에서 제외). **현재 대여 중(`rented`)인 수량의 합 + 신청 수량 ≤ `rentable_qty`** 이면 신청 가능하다. 반납·취소된 수량은 점유에서 빠져 다시 빌려줄 수 있다
- **이중 대여 방지**: 물품별 advisory 락(`pg_advisory_xact_lock`) 트랜잭션 안에서 `INSERT ... SELECT ... WHERE` 가드로 점유 합계를 검사한다. HTTP 드라이버는 무상태라 요청마다 별도 세션이고, READ COMMITTED에서 단일 문장의 원자성만으로는 두 동시 신청의 직렬화가 보장되지 않는다 (§6)
- **연체·반납 예고 알림은 없다**: 반납 기한 자체가 없으므로 연체 개념도 없다. 관리자는 대시보드의 '대여 중' 목록으로만 미반납 건을 파악한다

## 4. 기능 명세

### 4.1 회원

- 최초 로그인 후 프로필 입력: 이름·연락처(휴대폰). 연락처는 대여 연락 목적으로만 사용하며, 미등록 상태로 대여하면 서버가 400(`phone_required`)으로 막고 화면이 프로필 입력으로 유도한다
- 마이페이지: 대여 중 / 대여 이력 목록, **반납**, 대여 취소
- **반납은 회원이 직접 한다**: 물품을 돌려준 사람이 마이페이지에서 [반납]을 누르면 바로 `returned`가 되고 재고가 복구된다. 관리자에게 요청할 필요가 없다. 관리자도 같은 일을 할 수 있다(§4.3) — 두 경로의 차이는 `admin_id` 기록 여부뿐이고, 회원이 반납한 건은 `admin_id`가 비어 관리자 목록에 "회원이 직접 반납했어요 — 물품 회수 여부를 확인해 주세요"로 뜬다
- **취소와 반납은 다르다**: 취소(`cancelled`)는 "빌리지 않기로 함", 반납(`returned`)은 "돌려줬음". 둘 다 재고를 즉시 되돌리지만 이력 화면에서 구분되고, 회원 반납은 자기 신고이므로 관리자가 확인할 대상이 된다
- 탈퇴: 회원이 관리자에게 요청하면 `/admin/members` 에서 처리한다. 소프트 삭제 — `members.deactivated_at` 에 시각만 남기고 대여 이력·이름은 보존하며, 세션이 즉시 무효화되어 다시 로그인할 수 없다. **대여 중인 건 본인이 반납할 수 없으므로 관리자가 `/admin/reservations` 에서 반납 처리해야 한다** (복구 경로는 없다)

### 4.2 물품

- 목록: 검색 + 가용 배지 3종 — `available`(대여 가능) / `rented`(대여 중) / `repair`(수리중 — 상태가 `repair`이거나 `rentable_qty ≤ 0`). 검색 대상은 이름·설명·위치·카테고리 이름 (§4.2)
- **카테고리 (0020 재도입 → 0021 다대다)** — 0005·0011에서 두 번 제거했던 카테고리를 '관리자가 물품 등록·수정 중에 직접 만들고 고치는 가벼운 분류'로 복원했다. `categories(id, name UNIQUE)` + 조인 테이블 `item_categories(item_id, category_id)` — 물품 하나가 카테고리 여러 개에 속할 수 있고 아예 없을 수도 있다(0021에서 단일 FK를 승격). 회원 화면에는 필터로 노출하지 않고 ①검색 ②상세 화면에만 보인다. 등록·수정 다이얼로그는 태그 칩 에디터(이름 입력 + 엔터/콤마로 추가, ✕로 제거) — 새 이름이면 저장 시점에 `POST /api/admin/categories` 로 먼저 만들고 id 배열을 보낸다. 관리(추가·이름변경·삭제)는 `/admin/items` 물품 관리 페이지의 '카테고리 관리' 모달에서 하고, 카테고리 삭제 시 조인 행이 함께 사라져 물품은 그대로 남는다(태그만 없어진다)
  - 검색어가 없으면 폐기(`retired`)를 뺀 전체 목록을 최근 등록 순으로 보여준다
  - **키워드 매치**(이름·설명·보관 위치 ILIKE)를 먼저, **의미 매치**(pgvector)를 그 뒤에 배치한다
  - 의미 검색: Workers AI `@cf/baai/bge-m3`로 쿼리 임베딩 → 코사인 거리 상위 8개(거리 < 0.75) 중 키워드에 없는 물품만 추가. bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계로는 관련/무관을 가르지 못하므로 상대 랭킹으로만 쓴다. 임베딩은 등록/수정 시 자동 생성하고, 실패하면 키워드 검색만 동작한다(폴백)
- 물품 속성: `kind`(대여품 `rental` / 소모품 `consumable`), `location`(보관 위치), `qty_broken`(수리중 수량) — 실물 시트에서 들어온 값이라 비어 있을 수 있고 **전부 선택 항목**이다. `size`/`color`/`note`는 로직·검색에 안 쓰여 0016에서 컬럼을 제거했고, 시트의 원본사이즈는 등록 시 설명으로 접는다(backfill-remove-item-attrs.ts 동일 규칙). 보관 위치는 상세·편집 폼에만 표시하고 카드에는 띄우지 않는다(청년물품은 '정토회관' 단일 값이라 잡음)
  - 소모품: **대여 대상이 아니다.** 상세는 신청 폼 대신 "소모품은 대여 대상이 아니에요" 안내와 재고(`전체 보유`)만 보여주고, 홈 카드·상세에 가용 배지와 "대여 가능" 수량을 내리지 않는다(서버가 `availability_badge`를 `null`로 반환). API로 직접 신청해도 서버가 `409 consumable`로 거부한다. 재고 조정은 관리자만 가능하다
- 상세: 사진(최대 3장), 설명, 보유 수량, 실시간 잔여 수량
  - 수량 표시: 잔여 수량은 홈 카드(`대여 가능 3 / 7개` — 수량 ≥ 2인 물품만), 상세, 마이페이지 대여 목록, 관리자 대시보드·대여 목록에 나온다. 대여 수량은 **1 ~ 현재 대여 가능 수량** 사이에서 고르고 남은 수량이 없으면 버튼이 비활성화된다
  - 사진은 업로드 전 브라우저에서 재인코딩(최장 변 1600px·WebP q80, 미지원 브라우저는 JPEG) — 원본 미보관, EXIF 제거, 파일당 통상 300KB 이하. 서버는 픽셀 1600px·바이트 2MB를 다시 검사한다(API 직접 호출 우회 방지)
- 관리자: 등록/수정/삭제, 상태(정상/수리중/폐기) 관리, 수리중 수량 입력, 사진 업로드(R2)

### 4.3 대여

- **대여 기간 정책이 없다** — 날짜·최대 대여일(`max_days`)·승인 단계를 모두 제거했다 (§3)
- 대여: **수량(1 ~ 현재 대여 가능 수량)** 선택 + 메모(선택) → 즉시 대여 중. 잔여 수량이 있으면 부분 대여(10개 중 3개)가 가능하다
- 반납: 회원과 관리자가 모두 할 수 있다 (§4.1). 관리자 경로는 `admin_id` 를 기록하고, 회원 경로는 비워 둔다
- 관리자 화면에서 가능한 처리: **반납 체크와 회원이 반납한 건의 확인**뿐이다. 승인·거절·수령·수량 조정은 없다

### 4.4 관리자

- 대시보드: 대여 중 건수와 대여 중 목록 (반납 대상 확인용), 반납 완료·취소 건수
- 회원 관리: 역할 지정/해제(관리자만 — §2), 탈퇴 처리(소프트 삭제 — §4.1). 마지막 관리자는 서버가 409(`last_admin`)로 거부한다

## 5. 아키텍처

### 5.1 폴더 구조

```
web/src/
  app-shell.ts        — 헤더·네비 + 라우터 아웃렛
  router.ts           — @lit-labs/router 라우트 정의 + 가드
  styles/tokens.css   — 디자인 토큰 (색·간격·타입)
  context/            — session, toast (@lit/context)
  api/                — fetch 래퍼 (401 처리, 에러 토스트)
  components/ui/      — badge, availability-strip, x-calendar 등
  pages/              — home, item-detail, mypage, login, profile, policy, admin/*
server/src/
  index.ts            — Hono 앱 (라우트 마운트)
  routes/             — items, reservations, admin, auth
  services/           — SQL·도메인 로직
  middleware/         — requireAuth(getSessionUser), requireAdmin
```

### 5.2 인증 플로우

1. SPA 로드 시 `GET /api/me`로 세션 확인 → session 컨텍스트에 저장
2. 로그인은 `POST /api/auth/signin/:provider`(CSRF 토큰 + `X-Auth-Return-Redirect` 헤더)로 OAuth URL을 받아 **full-page redirect** → 콜백 후 SPA 복귀 (@auth/core 0.41은 `GET /signin/:provider`를 지원하지 않는다)
3. JWT는 **HttpOnly + Secure + SameSite=Lax 쿠키** — 클라이언트 JS가 토큰에 접근할 수 없다
4. API가 401을 반환하면 fetch 래퍼가 세션을 `null`로 갱신하고 라우트 가드가 `/login`으로 보낸다
5. 탈퇴(`deactivated_at` 값 존재) 회원은 `getSessionUser` 조회에서 제외된다 — 남아 있던 쿠키로도 모든 API 가 401 이 되어 세션이 즉시 무효화된다 (§4.4)

### 5.3 라우트 가드

- `/mypage`, `/signup/profile` → 로그인 필요
- `/admin/*` → 로그인 + `role = admin` (아니면 안내 화면)
- 판단 기준은 모두 `/api/me` 응답값이며, 실제 권한은 서버 미들웨어가 이중으로 강제한다 (§6.5)

### 5.4 API 엔드포인트

| 메서드              | 경로                                                         | 설명                                               | 권한     |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------- | -------- |
| GET                 | `/api/me`                                                    | 세션 사용자 (없으면 200 + `{user:null}`)           | 전체     |
| *                   | `/api/auth/*`                                                | Auth.js 표준 (signin/callback/signout)             | 전체     |
| PUT                 | `/api/me/profile`                                            | 이름·연락처 입력                                   | 로그인   |
| GET                 | `/api/items?q=`                                              | 물품 목록 + 가용 배지 — `q` 생략 시 전체 목록      | 전체     |
| GET                 | `/api/items/:id`                                             | 상세 + 사진 (회원 정보 제외)                       | 전체     |
| POST                | `/api/reservations`                                          | 대여 (advisory 락 트랜잭션 — §6.2)                 | 로그인   |
| GET                 | `/api/reservations/mine`                                     | 내 대여 현황·이력                                  | 로그인   |
| POST                | `/api/reservations/:id/cancel`                               | 대여 취소                                          | 본인     |
| POST                | `/api/reservations/:id/return`                               | 반납 (회원 직접)                                   | 본인     |
| GET/POST/PUT/DELETE | `/api/admin/items`                                           | 물품 CRUD (등록/수정 시 임베딩 자동 생성)          | admin    |
| POST/DELETE         | `/api/admin/items/:id/photos[/:photoId]`                     | 사진 업로드·삭제 (R2)                              | admin    |
| GET                 | `/api/categories`                                            | 카테고리 목록(이름·물품 수) — 전체 열람             | 전체     |
| POST/PATCH/DELETE   | `/api/admin/categories[/:id]`                                | 카테고리 생성·이름변경·삭제 (삭제 시 물품은 미지정) | admin    |
| GET                 | `/api/admin/reservations?status=`                            | 전체 대여 목록                                     | admin    |
| POST                | `/api/admin/reservations/:id/return`                         | 반납 처리 (관리자)                                 | admin    |
| GET/POST            | `/api/admin/members`, `/:id/withdraw`     | 회원 목록·탈퇴 처리                       | admin    |
| PUT                 | `/api/admin/members/:id/role`                                | 역할 지정/해제 (마지막 관리자 보호)                | admin    |
| GET                 | `/api/admin/dashboard`                                       | 대여 중 건수·목록, 반납/취소 건수                  | admin    |

### 5.5 Wrangler 설정 (SPA 폴백 + API 분기)

```jsonc
{
  "main": "server/src/index.ts",
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application", // 모든 라우트 → index.html
    "run_worker_first": ["/api/*"], // API는 워커가 우선 처리
  },
}
```

### 5.6 대여 신청 UI

- 물품 상세의 신청 폼은 **수량 입력 + 메모 + 대여 버튼**뿐이다. 날짜 캘린더(`x-calendar`)와 90일 가용성 띠(`availability-strip`)는 제거했다
- 수량 입력은 `1 ~ 현재 대여 가능 수량` 사이에서 고르고, 남은 수량이 없으면 사유를 표시하고 버튼을 비활성화한다
- 남은 수량이 1개인 물품은 수량 입력을 숨긴다 (고를 것이 없다)

## 6. 데이터베이스 설계 (Neon / PostgreSQL)

### 6.1 DDL

```sql
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT,                              -- nullable — 최초 로그인 시 미수집, 프로필 입력에서 채움
  role       TEXT NOT NULL DEFAULT 'user',      -- user | admin
  deactivated_at TIMESTAMPTZ,                   -- NULL = 활성, 값 있음 = 탈퇴(소프트 삭제 — 0018). 승인 상태 컬럼은 없다
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | repair | retired
  total_qty   INTEGER NOT NULL DEFAULT 1,
  embedding   vector(1024),                     -- 의미 검색 (pgvector) — 등록/수정 시 자동 생성
  source_key  TEXT,                             -- 실물 시트 행 키('Y26-*') — 일괄 반영의 멱등 키
  kind        TEXT NOT NULL DEFAULT 'rental',   -- rental 대여품 | consumable 소모품
  location    TEXT,                             -- 보관 위치
  qty_broken  INTEGER NOT NULL DEFAULT 0,       -- 수리중 수량 — rentable_qty 에서 차감
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 0016: size/color/note 컬럼 제거 (규격·색상·내부 메모 — 로직·검색에 미사용, 등록 폼에도 없었음)
-- 대여 기간 정책(items.max_days)은 0015에서 제거했다 — 날짜 개념 자체가 없다
ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_kind, ADD CONSTRAINT chk_items_kind CHECK (kind IN ('rental', 'consumable'));
ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_qty_broken, ADD CONSTRAINT chk_items_qty_broken CHECK (qty_broken >= 0 AND qty_broken <= total_qty);

-- 대여 가능 수량 rentable_qty = total_qty - qty_broken (서버가 계산해 내려준다)
-- source_key 는 부분 유니크 — 수동 등록 물품(NULL)은 제약에서 제외한다
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_key
  ON items (source_key) WHERE source_key IS NOT NULL;

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
  status      TEXT NOT NULL DEFAULT 'rented',   -- rented | returned | cancelled
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  qty         INTEGER NOT NULL DEFAULT 1,       -- 대여 수량 — 가용 판정은 SUM(qty) 기준
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_qty, ADD CONSTRAINT chk_reservations_qty CHECK (qty >= 1);
-- 0015: start_date/end_date/status_note 를 제거하고 상태 집합을 3종으로 고정했다
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status, ADD CONSTRAINT chk_reservations_status CHECK (status IN ('rented', 'returned', 'cancelled'));

-- 가용성 판정(§3)과 이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_reservations_item_status_qty
  ON reservations (item_id, status, qty);
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);
```

### 6.2 가용성 판정 쿼리 (이중 대여 방지)

```sql
-- 한 트랜잭션 (neon HTTP 드라이버의 transaction([...]) — 락은 커밋/롤백 시 자동 해제)
SELECT pg_advisory_xact_lock($1::bigint);          -- 물품별 직렬화 지점

INSERT INTO reservations (item_id, member_id, member_memo, qty, status)
SELECT $1, $2, $3, $4, 'rented'
WHERE $4 <= (SELECT total_qty - qty_broken FROM items WHERE items.id = $1)   -- 재고 자체보다 큰 수량은 거부
  AND EXISTS (SELECT 1 FROM items
               WHERE items.id = $1 AND status = 'active' AND kind <> 'consumable')
  AND $4 + COALESCE((SELECT SUM(r.qty) FROM reservations r
                      WHERE r.item_id = $1 AND r.status = 'rented'), 0)
      <= (SELECT total_qty - qty_broken FROM items WHERE items.id = $1)      -- 현재 대여 중 수량 합 검사
RETURNING id;
-- 조건 실패 → affected rows = 0 → 대여 거절 (API는 409 반환)
-- 락이 두 동시 신청을 직렬화한다 — 락 없는 단일 문장은 READ COMMITTED 스냅샷 때문에 둘 다 통과할 수 있다
```

날짜가 없어져 `generate_series` 일별 점유 검사가 사라졌다. 점유는 "지금 나가 있는 수량의 합" 하나뿐이고,
`returned`·`cancelled` 행은 합계에서 제외되므로 반납된 수량은 즉시 다시 빌려줄 수 있다.
재고 자체보다 큰 수량을 먼저 거르는 이유는, 겹치는 대여가 0건일 때 합계 조건만으로는
`SUM = 0`이 되어 통과해버리기 때문이다.

### 6.3 임베딩 백필

`embedding`은 물품 등록/수정 API 안에서만 생성된다. 실물 시트 일괄 반영처럼 **DB에 직접 INSERT하는 경로는 임베딩을 남기지 못하고**, 목록 쿼리가 `embedding IS NOT NULL`인 행만 후보로 삼으므로 그 물품들은 의미 검색에서 조용히 빠진다(에러 없음). 등록/수정 API를 거치지 않는 일괄 입력 뒤에는 `deno task db:reembed`를 실행한다.

### 6.4 연결 방식

`@neondatabase/serverless` HTTP 드라이버(fetch 기반) — Workers 무료 플랜에서 동작하고 TCP·Hyperdrive가 필요 없다. HTTP 모드는 무상태라 요청마다 클라이언트를 생성해도 안전하다. `DATABASE_URL`은 배포 시 `wrangler secret put`, 로컬은 `.dev.vars`/`.env`로 관리한다.

### 6.5 권한 처리 (애플리케이션 레벨)

Hono 미들웨어에서 통일 강제한다.

- `requireAuth`: 세션 JWT 검증
- 로그인 회원이면 대여 API 접근 가능 — 승인 개념이 없어졌으므로 통과 조건은 `getSessionUser`(탈퇴 회원 제외)뿐이다
- `requireAdmin`: `role = 'admin'`만 `/api/admin/*` 운영 라우트 접근
- 모든 예약 쿼리에 `WHERE member_id = :session_user` 조건 필수 (관리자 제외)
- 클라이언트 라우트 가드(§5.3)는 UX일 뿐 — 실제 권한은 전부 서버에서 검사한다

## 7. 비기능 요구사항

1. **개인정보 최소 수집**: 이름·연락처만 수집. 수집 목적·보관 기간을 명시한 개인정보 처리방침 페이지 필수, 연락처는 대여 연락 목적으로만 사용
2. **보안**: OAuth 시크릿·R2 토큰은 Workers Secrets로 관리. JWT는 서명 검증 + HttpOnly 쿠키 저장으로 SPA JS 접근을 차단하고, 관리자 API는 미들웨어에서 role을 검사한다 (§6.5)
3. **번들 예산**: 초기 로드 gzip 150KB 이하. 이미지는 R2에서 지연 로딩
4. **반응형**: 모바일 우선 (대여 신청은 휴대폰에서 이루어질 것으로 가정). 하단 탭 네비 등 모바일 앱형 내비게이션
5. **브라우저 지원**: 모던 브라우저 최신 2버전 (Chrome, Safari, Samsung Internet — Shadow DOM 기본 지원 범위)
6. **백업**: Neon 무료 플랜 PITR 창은 시간 단위로 짧아 유일한 수단으로 부적합 → **주 1회 GitHub Actions에서 `pg_dump`**를 실행해 비공개 아티팩트로 보관 (주요 백업 수단). 분기 1회 복원 테스트로 유효성을 확인한다
7. **가용성**: Workers는 일시정지가 없다. Neon 무료 플랜은 ~5분 유휴 후 컴퓨트가 일시정지되어 재요청 시 수백 ms 콜드스타트가 생기지만 지부 규모에서는 체감이 미미하다

## 8. 무료 티어 한계 (2026-09 기준, 공식 문서 확인)

| 서비스        | 무료 한도                                                         | 본 서비스 필요량               | 판정                           |
| ------------- | ----------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| Workers Free  | 요청 100,000/일, CPU 10ms/요청                                    | 지부 규모 일 수백 요청         | ✅ 여유                        |
| Neon Free     | 저장 0.5GB · 월 컴퓨트 ~190시간 · 5분 유휴 일시정지               | 데이터 수십 KB, 간헐적 접속    | ✅ 여유 (유휴 콜드스타트 인수) |
| Neon Free     | PITR 창 짧음 (시간 단위)                                          | 주간 pg_dump로 보완            | ⚠️ 보완 필요                   |
| R2 Free       | 저장 10GB · Class A 100만/월 · Class B 1,000만/월 · 이그레스 무료 | 사진 50개 물품 × 3장 ≈ 수백 MB | ✅ 여유                        |
| Cron Triggers | 무료 플랜 포함 (계정당 3개)                                       | 미사용                         | ✅                             |

**총 운영 비용: 월 0원** (커스텀 도메인 사용 시 연 약 2만원 선택 · Cloudflare 무료 플랜은 비영리 제한 없음)

## 9. 향후 확장

- QR 코드로 물품 식별·대여/반납 처리 (관리자 스마트폰)
- 물품별 대여 통계 대시보드
- 장기 미반납 알림 (반납 기한 개념을 되살리지 않고 `created_at` 경과일 기준으로)
- 물품 예약 캘린더 뷰 (월간 그리드 — §5.6)
- Cloudflare Access로 운영진 관리자 페이지 이중 보호
- 중고 거래 게시판 등 지부 커뮤니티 기능
- PWA (오프라인 캐시, 홈 화면 추가)
