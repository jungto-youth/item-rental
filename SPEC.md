# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

지부 회원(계정제)이 보유 물품을 검색해 대여를 신청하고, 관리자가 승인·수령·반납을 처리하는 소규모 서비스(물품 97개). Cloudflare(호스팅·저장소) + Neon(PostgreSQL) 위에서 동작한다.

현재 구현 상태는 [README.md](README.md), 화면 규칙은 [DESIGN.md](DESIGN.md)를 본다.

## 1. 프로젝트 개요

| 항목             | 내용                                                                |
| ---------------- | ------------------------------------------------------------------- |
| 목적             | 지부 보유 물품(캠핑용품, 행사장비 등)의 대여 예약을 온라인으로 관리 |
| 이용자           | 지부 회원(승인제) · 관리자(운영진)                                  |
| 물품 규모        | 97개 (대여품 93 · 소모품 4) — 카테고리 없이 검색으로 탐색           |
| 예상 동시 이용자 | 수 명 수준 (지부 단위 소규모)                                       |
| 운영 비용        | 월 0원 (Cloudflare·Neon 무료 티어)                                  |
| 운영 환경        | Cloudflare 대시보드(호스팅·저장소·도메인) + Neon 콘솔(DB) — 2곳     |
| 유지보수         | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱·서버 설치 불필요)      |

## 2. 사용자 및 권한

| 역할                    | 권한                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| 미인증 방문자           | 물품 목록·상세 열람, 로그인                                                      |
| 승인 대기 회원          | 마이페이지(승인 대기 상태 확인)만 접근                                           |
| 회원 (`user`, approved) | 물품 검색, 대여 신청, 내 예약 현황·이력 조회, 신청 취소                          |
| 관리자 (`admin`)        | 물품 CRUD, 대여 승인/거절·수령·반납, 회원 승인, 전체 이력 조회, 관리자 지정/해제 |

- 가입: 구글 소셜 로그인 → 최초 로그인 시 `members` 자동 생성(pending) → 프로필(이름·연락처) 입력 → 관리자 승인 후 이용
- 로그인 허용: `@jungto.org` 계정만. 예외는 `AUTH_ALLOWED_EMAILS` 시크릿에 콤마 구분으로 나열하고, 비허용 계정은 로그인 단계에서 거부한다
- 세션: JWT 무상태 — 서명 검증 후 `members` 1회 조회로 최신 role/status 반영
- 역할 지정/해제: 관리자만 가능. 마지막 관리자는 본인 포함 해임 불가, 미승인 회원은 임명 불가. 첫 관리자는 DB 수동 지정 1회

## 3. 대여 상태 흐름 (핵심 플로우)

```
[물품 상세] 기간·수량 선택 → 신청(pending)
   → 관리자 승인(approved) ── 거절(rejected)
   → 수령(picked_up)
   → 반납(returned)          ── 수령 전 취소(cancelled)
   → 반납일 지연 시 연체(overdue) 표시
```

- **가용성 판정**: 대여 가능 수량은 `rentable_qty = total_qty - qty_broken` (수리중 수량은 재고에서 제외). 신청 기간의 **매 대여일**마다 상태가 `pending/approved/picked_up`인 예약의 **`SUM(qty)` + 신청 수량 ≤ `rentable_qty`** 이면 신청 가능. 신청 수량 자체가 `rentable_qty`를 넘으면 겹치는 예약이 없어도 거부한다
- **반개구간**: 반납일(`end_date`)은 점유에서 제외한다 — `[start, end)`. 당일 반납은 불가하고, 붙어 있는 예약은 충돌이 아니다
- **이중 예약 방지**: 물품별 advisory 락(`pg_advisory_xact_lock`) 트랜잭션 안에서 `INSERT ... SELECT ... WHERE NOT EXISTS(일별 점유 초과)`를 실행한다. HTTP 드라이버는 무상태라 요청마다 별도 세션이고, READ COMMITTED에서 단일 문장의 원자성만으로는 두 동시 신청의 직렬화가 보장되지 않는다 (§6)
- 승인 시점에 확정 예약만으로 이미 정원인 날이 있으면 관리자에게 경고를 표시한다. 신청 가드가 `pending`까지 일별 점유로 세므로 정상 흐름에서는 0이고, 0이 아니면 동시성 레이스나 `total_qty` 인하 같은 이상 상태다
- 반납 예고·연체 알림은 **없다**. 연체는 목록·마이페이지의 **계산 배지**로만 드러난다 (`picked_up` + 반납일 경과)

## 4. 기능 명세

### 4.1 회원

- 최초 로그인 후 프로필 입력: 이름·연락처(휴대폰). 연락처는 대여 연락 목적으로만 사용하며, 미등록 상태로 신청하면 서버가 400(`phone_required`)으로 막고 화면이 프로필 입력으로 유도한다
- 마이페이지: 대여 중 / 승인 대기 / 대여 예정 / 대여 이력 목록, 신청 취소
- 탈퇴: 소프트 삭제 (대여 이력 보존을 위해 비활성화 처리)

### 4.2 물품

- 목록: 검색 + 가용 배지 4종 — `available`(대여 가능) / `reserved`(예약 있음) / `rented`(대여 중) / `repair`(수리중 — 상태가 `repair`이거나 `rentable_qty ≤ 0`). 카테고리는 없다
  - 검색어가 없으면 폐기(`retired`)를 뺀 전체 목록을 최근 등록 순으로 보여준다
  - **키워드 매치**(이름·설명·보관 위치 ILIKE)를 먼저, **의미 매치**(pgvector)를 그 뒤에 배치한다
  - 의미 검색: Workers AI `@cf/baai/bge-m3`로 쿼리 임베딩 → 코사인 거리 상위 8개(거리 < 0.75) 중 키워드에 없는 물품만 추가. bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계로는 관련/무관을 가르지 못하므로 상대 랭킹으로만 쓴다. 임베딩은 등록/수정 시 자동 생성하고, 실패하면 키워드 검색만 동작한다(폴백)
- 물품 속성: `kind`(대여품 `rental` / 소모품 `consumable`), `location`(보관 위치), `size`, `color`, `qty_broken`(수리중 수량), `note` — 실물 시트에서 들어온 값이라 대부분 비어 있을 수 있고 **전부 선택 항목**이다. 보관 위치는 상세·편집 폼에만 표시하고 카드에는 띄우지 않는다(청년물품은 '정토회관' 단일 값이라 잡음)
  - 소모품: **대여 대상이 아니다.** 상세는 신청 폼 대신 "소모품은 대여 대상이 아니에요" 안내와 재고(`전체 보유`)만 보여주고, 홈 카드·상세에 가용 배지와 "대여 가능" 수량을 내리지 않는다(서버가 `availability_badge`를 `null`로 반환). API로 직접 신청해도 서버가 `409 consumable`로 거부한다. 재고 조정은 관리자만 가능하다
- 상세: 사진(최대 3장), 설명, 보유 수량, 대여 규칙(기본 대여일 수), 실시간 가용 일정
  - 수량 표시: 잔여 수량은 홈 카드(`대여 가능 3 / 7개` — 수량 ≥ 2인 물품만), 상세(일정 띠·캘린더), 마이페이지 예약 목록, 관리자 대시보드·예약 목록에 나온다. 신청 수량은 **1 ~ 해당 기간 잔여 수량** 사이에서 고르고, 기간을 바꾸면 1로 초기화한다(기간이 넓어지면 잔여 수량이 줄어든다)
  - 사진은 업로드 전 브라우저에서 재인코딩(최장 변 1600px·WebP q80, 미지원 브라우저는 JPEG) — 원본 미보관, EXIF 제거, 파일당 통상 300KB 이하. 서버는 픽셀 1600px·바이트 2MB를 다시 검사한다(API 직접 호출 우회 방지)
- 관리자: 등록/수정/삭제, 상태(정상/수리중/폐기) 관리, 수리중 수량 입력, 사진 업로드(R2)

### 4.3 대여

- 신청: 날짜 범위 + **수량(1 ~ 해당 기간 잔여 수량)** 선택 → 겹침 검사 → 신청 (메모 입력 가능). 잔여 수량이 있으면 부분 대여(10개 중 3개)가 가능하다
- 관리자 처리: 승인/거절(사유 필수), 수령 체크, 반납 체크. 승인 시 수량은 **줄일 수 있고 늘릴 수는 없다**(늘리면 재고를 넘길 수 있어 400 `qty_increase_not_allowed`). 확정 예약만으로 이미 정원인 날이 있는 신청은 목록에 `정원 초과 N일` 배지로 뜨고 승인 시 confirm을 거친다
- 연체: 반납일 경과 시 목록에 `연체` 배지
- 대여 기간 정책: 기본 7일, `settings` 테이블에서 변경 가능

### 4.4 관리자

- 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수
- 회원 관리: 승인 대기 목록 → 승인/거절, 역할 지정/해제 (역할 변경은 관리자만 — §2)
- 이력: `/admin/history` — 2025 청년페스타 시트 스냅샷(`rental_history`)을 보는 조회 전용 화면. 물품명·신청자·소속을 한 검색어로 훑고(ILIKE `%q%` — 검색어의 `%`·`_`는 와일드카드로 남긴다) 청년/회관물품 필터와 50건씩 '더 보기'를 제공한다. 상태 전이·수정이 없는 참고 자료이며 가용성 판정에는 관여하지 않는다

## 5. 아키텍처

### 5.1 폴더 구조

```
web/src/
  app-shell.ts        — 헤더·네비 + 라우터 아웃렛
  router.ts           — @vaadin/router 라우트 정의 + 가드
  styles/tokens.css   — 디자인 토큰 (색·간격·타입)
  context/            — session, toast (@lit/context)
  api/                — fetch 래퍼 (401 처리, 에러 토스트)
  components/ui/      — badge, availability-strip, x-calendar 등
  pages/              — home, item-detail, mypage, login, profile, policy, admin/*
server/src/
  index.ts            — Hono 앱 (라우트 마운트)
  routes/             — items, reservations, admin, auth
  services/           — SQL·도메인 로직
  middleware/         — requireAuth, requireApproved, requireAdmin
```

### 5.2 인증 플로우

1. SPA 로드 시 `GET /api/me`로 세션 확인 → session 컨텍스트에 저장
2. 로그인은 `POST /api/auth/signin/:provider`(CSRF 토큰 + `X-Auth-Return-Redirect` 헤더)로 OAuth URL을 받아 **full-page redirect** → 콜백 후 SPA 복귀 (@auth/core 0.41은 `GET /signin/:provider`를 지원하지 않는다)
3. JWT는 **HttpOnly + Secure + SameSite=Lax 쿠키** — 클라이언트 JS가 토큰에 접근할 수 없다
4. API가 401을 반환하면 fetch 래퍼가 세션을 `null`로 갱신하고 라우트 가드가 `/login`으로 보낸다
5. 승인 대기(pending) 회원은 `/mypage`만 허용

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
| GET                 | `/api/items/:id`                                             | 상세 + 사진 + 향후 90일 점유 일정 (회원 정보 제외) | 전체     |
| POST                | `/api/reservations`                                          | 대여 신청 (advisory 락 트랜잭션 — §6.2)            | approved |
| GET                 | `/api/reservations/mine`                                     | 내 예약 현황·이력                                  | approved |
| POST                | `/api/reservations/:id/cancel`                               | 신청 취소                                          | 본인     |
| GET/POST/PUT/DELETE | `/api/admin/items`                                           | 물품 CRUD (등록/수정 시 임베딩 자동 생성)          | admin    |
| POST/DELETE         | `/api/admin/items/:id/photos[/:photoId]`                     | 사진 업로드·삭제 (R2)                              | admin    |
| GET                 | `/api/admin/reservations?status=`                            | 전체 예약 목록                                     | admin    |
| POST                | `/api/admin/reservations/:id/{approve,reject,pickup,return}` | 상태 처리                                          | admin    |
| GET/POST            | `/api/admin/members`, `/:id/{approve,reject,deactivate}`     | 회원 목록·승인/거절/비활성화                       | admin    |
| PUT                 | `/api/admin/members/:id/role`                                | 역할 지정/해제 (마지막 관리자 보호)                | admin    |
| GET                 | `/api/admin/dashboard`                                       | 오늘 수령/반납, 승인 대기, 연체 건수               | admin    |
| GET                 | `/api/admin/history?q=&scope=&page=&limit=`                  | 과거 대여 이력                                     | admin    |

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

### 5.6 날짜 선택·가용 UI

- `x-calendar`: 인라인 범위 캘린더 — 두 번 탭(첫 탭 시작일, 두 번째 탭 반납일). 일별 점유(`days × rentable_qty`)로 전량 예약일을 미리 비활성화하되 반납일로는 선택 가능(반개구간). 로컬 오늘 이전은 차단하고, 최대 대여일·구간 내 전량 예약은 사유 라벨로 표기한다. roving tabindex + 방향키 이동, `:focus-visible` 지원
- `availability-strip`: 서버가 내려준 점유 일정을 향후 90일 막대로 시각화 (점유일·잔여 수량)

## 6. 데이터베이스 설계 (Neon / PostgreSQL)

### 6.1 DDL

```sql
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT,                              -- nullable — 최초 로그인 시 미수집, 프로필 입력에서 채움
  role       TEXT NOT NULL DEFAULT 'user',      -- user | admin
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | inactive
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | repair | retired
  total_qty   INTEGER NOT NULL DEFAULT 1,
  max_days    INTEGER NOT NULL DEFAULT 7,
  embedding   vector(1024),                     -- 의미 검색 (pgvector) — 등록/수정 시 자동 생성
  source_key  TEXT,                             -- 실물 시트 행 키('Y26-*') — 일괄 반영의 멱등 키
  kind        TEXT NOT NULL DEFAULT 'rental',   -- rental 대여품 | consumable 소모품
  location    TEXT,                             -- 보관 위치
  size        TEXT,                             -- 사이즈·규격
  color       TEXT,
  qty_broken  INTEGER NOT NULL DEFAULT 0,       -- 수리중 수량 — rentable_qty 에서 차감
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | picked_up | returned | rejected | cancelled
  status_note TEXT,
  member_memo TEXT,
  admin_id    TEXT REFERENCES members (id),
  qty         INTEGER NOT NULL DEFAULT 1,       -- 예약 수량 — 가용 판정은 SUM(qty) 기준
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_qty, ADD CONSTRAINT chk_reservations_qty CHECK (qty >= 1);

-- 가용성 판정(§3)과 이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_reservations_item_dates
  ON reservations (item_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);

-- 2025 청년페스타 '물품대여' 시트의 과거 대여 이력 스냅샷 — reservations 에 합치지 않는 이유:
-- ① 청년/회관물품 구분이 자유 텍스트라 items FK 를 강제할 수 없고(연결된 item_id 는 216건 중 10건),
-- ② 신청자가 members 에 없으며(source_key 로 재수입), ③ 반납 여부·출고 상태 같은 옛 운영 컬럼을
-- 예약 상태 머신에 끼워 넣으면 §3 이 오염된다. 이력 '조회(참고)'용이며 가용성 판정에는 관여하지 않는다.
CREATE TABLE IF NOT EXISTS rental_history (
  id              serial PRIMARY KEY,
  source_key      TEXT NOT NULL,               -- 원본 행 식별자 (재수입 멱등 키)
  source_row      INTEGER,
  item_name       TEXT NOT NULL,               -- 시트의 자유 텍스트 물품명
  item_id         INTEGER REFERENCES items (id) ON DELETE SET NULL,  -- 이름 매칭된 경우만
  item_scope      TEXT,                        -- '청년물품' | '회관물품'
  member_name     TEXT NOT NULL,               -- members 미등록 신청자 (이름만)
  org             TEXT,
  qty             INTEGER,
  requested_on    DATE,
  start_at        TIMESTAMP,
  end_at          TIMESTAMP,
  use_location    TEXT,
  procurement     TEXT,
  checkout_state  TEXT,
  return_state    TEXT,
  return_location TEXT,
  note            TEXT,
  internal_note   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_history_source_key
  ON rental_history (source_key);
CREATE INDEX IF NOT EXISTS idx_rental_history_item_id
  ON rental_history (item_id);
CREATE INDEX IF NOT EXISTS idx_rental_history_item_name
  ON rental_history (item_name);
CREATE INDEX IF NOT EXISTS idx_rental_history_requested_on
  ON rental_history (requested_on);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('max_rental_days', '7')
ON CONFLICT (key) DO NOTHING;
```

### 6.2 가용성 판정 쿼리 (이중 예약 방지)

```sql
-- 한 트랜잭션 (neon HTTP 드라이버의 transaction([...]) — 락은 커밋/롤백 시 자동 해제)
SELECT pg_advisory_xact_lock($1::bigint);          -- 물품별 직렬화 지점

INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo, qty)
SELECT $1, $2, $3, $4, $5, $6
-- 재고보다 큰 수량은 겹치는 예약이 없어도 거부한다. 이 조건을 NOT EXISTS 안쪽 HAVING 에만
-- 두면 겹치는 예약이 0건일 때 평가될 행이 없어 통과한다 — 사전 검사와 이 문장 사이에
-- 관리자가 수량을 줄인 경쟁 조건이 정확히 그 경우다.
WHERE $6 <= (SELECT total_qty - qty_broken FROM items WHERE items.id = $1)
  AND NOT EXISTS (
  -- 요청 기간의 매 대여일마다 잔여 수량 확인 — 하루라도 넘치면 거절 (SUM(qty) 기준)
  SELECT 1
  FROM generate_series($3::date, $4::date - 1, interval '1 day') AS d(day)
  JOIN reservations r
    ON r.item_id = $1
   AND r.status IN ('pending','approved','picked_up')
   AND r.start_date <= d.day::date
   AND r.end_date > d.day::date
  GROUP BY d.day
  HAVING COALESCE(SUM(r.qty), 0) + $6
         > (SELECT total_qty - qty_broken FROM items WHERE items.id = $1)
)
RETURNING id;
-- 조건 실패 → affected rows = 0 → 신청 거절 (API는 409 반환)
-- 락이 두 동시 신청을 직렬화한다 — 락 없는 단일 문장은 READ COMMITTED 스냅샷 때문에 둘 다 통과할 수 있다
```

### 6.3 임베딩 백필

`embedding`은 물품 등록/수정 API 안에서만 생성된다. 실물 시트 일괄 반영처럼 **DB에 직접 INSERT하는 경로는 임베딩을 남기지 못하고**, 목록 쿼리가 `embedding IS NOT NULL`인 행만 후보로 삼으므로 그 물품들은 의미 검색에서 조용히 빠진다(에러 없음). 등록/수정 API를 거치지 않는 일괄 입력 뒤에는 `deno task db:reembed`를 실행한다.

### 6.4 연결 방식

`@neondatabase/serverless` HTTP 드라이버(fetch 기반) — Workers 무료 플랜에서 동작하고 TCP·Hyperdrive가 필요 없다. HTTP 모드는 무상태라 요청마다 클라이언트를 생성해도 안전하다. `DATABASE_URL`은 배포 시 `wrangler secret put`, 로컬은 `.dev.vars`/`.env`로 관리한다.

### 6.5 권한 처리 (애플리케이션 레벨)

Hono 미들웨어에서 통일 강제한다.

- `requireAuth`: 세션 JWT 검증
- `requireApproved`: `status = 'approved'` 회원만 예약 API 접근
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

- QR 코드로 수령/반납 처리 (관리자 스마트폰)
- 물품별 대여 통계 대시보드
- 연체·반납 예고 알림 (이메일 대신 카카오톡 알림톡 등)
- 물품 예약 캘린더 뷰 (월간 그리드 — §5.6)
- Cloudflare Access로 운영진 관리자 페이지 이중 보호
- 중고 거래 게시판 등 지부 커뮤니티 기능
- PWA (오프라인 캐시, 홈 화면 추가)
