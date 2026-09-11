# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

버전: v2.11 (2026-09-11) · 규모: 소규모 (물품 ~50개) · 대상: 지부 회원 (계정제) · 플랫폼: Cloudflare (호스팅·저장소) + Neon (PostgreSQL DB)

> **변경 이력**
> - v1.1 (2026-09-03): Supabase/Vercel → Cloudflare(Workers + D1 + R2) 전면 교체. 인증은 Auth.js로 자체 구현. 이메일은 Resend 유지.
> - v2.0 (2026-09-08): **클라이언트를 Hono JSX 서버 렌더링 → 순수 Lit SPA로 전면 교체.** 서버는 Hono JSON API 전용(JSX 렌더링 제거). 스타일은 Tailwind → Lit `css` 템플릿 + CSS 커스텀 프로퍼티 디자인 토큰(Shadow DOM 캡슐화 유지).
> - v2.1 (2026-09-08): **DB를 D1(SQLite) → Neon(PostgreSQL)으로 교체.** 연결은 `@neondatabase/serverless` HTTP 드라이버(fetch 기반, Workers 친화). 백업은 주간 `pg_dump` 주도로 변경. 런타임은 여전히 workerd — Deno는 패키지 매니저/개발 도구 역할.
> - v2.2 (2026-09-08): **로그인 구현 — 구글 OAuth 단일 프로바이더** (카카오는 v2 후보로 이동). Auth.js JWT 세션 검증 후 members를 1회 조회해 최신 role/status를 반영 (무상태 JWT + 권한 변경 즉시 반영). 프로필 입력 API(`PUT /api/me/profile`) 추가.
> - v2.3 (2026-09-09): **의미 검색 도입.** 물품 등록/수정 시 Cloudflare Workers AI `@cf/baai/bge-m3`(다국어, 무료)로 임베딩 자동 생성 → Neon **pgvector** `vector(1024)` 컬럼 저장. 검색은 키워드 매치(ILIKE 이름·설명) 우선 + 의미 유사 물품(거리 상위 8개)을 뒤에 추가 — 절대 거리 임계는 관련/무관 구분력이 부족해 상대 랭킹으로 대체 (실측). 키워드 검색 이름만 → 설명 확장. members.phone nullable (최초 로그인 시 미수집).
> - v2.4 (2026-09-09): **카테고리 완전 제거.** LLM 자동 분류(이날 시도했다가 제거)조차 새 카테고리 생성·이름 관리라는 새 관리 포인트를 만들므로, 카테고리 테이블·컬럼·칩·분류기를 전부 제거하고 탐색을 검색(키워드+의미)으로 완전 대체. 홈은 검색바 + 전체 그리드. 등록 폼은 이름·설명·수량·상태만.
> - v2.5 (2026-09-09): **임베딩 백필 제거 + 등록 흐름 정리.** 등록/수정 시 자동 생성만으로 충분해 관리자 "임베딩 일괄 생성" 버튼과 `/api/admin/items/embeddings/backfill` 엔드포인트 삭제. AI 호출 실패로 임베딩이 빠진 물품은 재수정 시 자동 재생성으로 복구. 물품 등록 저장 후 자동으로 편집 모드로 전환해 사진을 바로 올릴 수 있게 함 (사진 API는 물품 id 기반이라 저장 전에는 불가).
> - v2.6 (2026-09-09): **등록 저장 1회 클릭 완료.** 등록 폼에서 사진을 직접 고르게 된(v2.5 후반) 시점부터 저장 후 편집 모드 전환은 불필요 — 성공 시 목록으로 바로 복귀하고, 사진 업로드 실패 시에만 편집 모드를 유지해 재업로드. 저장 진행 중 저장 버튼 비활성화("저장 중…" 표시)로 느린 요청(Neon 콜드스타트 등) 시 재클릭으로 인한 물품 중복 등록 방지.
> - v2.7 (2026-09-09): **역할 3단계 + 회원 관리 화면.** role을 `admin`(총관리자) > `manager`(관리자) > `user`(회원) 3단계로 확장. 총관리자는 역할 지정/해제(여러 명 가능 — 마지막 총관리자는 본인 포함 해임 불가, 미승인 회원은 임명 불가), 관리자는 물품·대여·회원 승인 운영. 기존 `member` 값은 `user`로 이관(마이그레이션 0006). `/admin/members` 회원 관리 화면과 API(목록·승인/거절은 manager 이상, `PUT /:id/role`은 admin 전용) 신설. 승인 대기 회원 행에는 역할 셀렉트 대신 배지를 보여 승인 선행이 화면에서 자명하게. 첫 총관리자는 기존처럼 DB 수동 지정.
> - v2.8 (2026-09-09): **헤더 네비에 물품 대여(홈) 링크 추가.** 기존엔 로고("물품 대여")만이 홈 링크라 일반 회원·익명 방문자에게 물품 목록 진입점이 메뉴에 없었음 — 전체 방문자 대상 첫 메뉴로 추가.
> - v2.9 (2026-09-10): **로그인 이메일 제한.** `@jungto.org` 계정만 로그인 허용, 나머지는 Auth.js `signIn` 콜백에서 차단(members 생성도 하지 않음) 후 `/login?error=AccessDenied`로 복귀 — 로그인 화면에 "정토회 계정(@jungto.org)으로 로그인해주세요" 표시. 운영진 개인 계정 등 예외는 `AUTH_ALLOWED_EMAILS` 시크릿(콤마 구분)으로 허용.
> - v2.10 (2026-09-10): **대여 플로우 구현** (마일스톤 3단계 — 이메일 알림·크론은 4단계). 회원: 물품 상세에서 기간 선택해 신청, 마이페이지 그룹 목록(대여 중/승인 대기/대여 예정/이력)·취소. 관리자: `/admin/reservations` 목록(상태 필터)·승인(겹침 경고 confirm)/거절(사유 필수, status_note 기록)/수령/반납. 세부 결정: ① 대여 기간 상한은 `items.max_days` 기준(settings.max_rental_days 미사용), ② 날짜는 반개구간 `[start, end)` — end_date는 반납일이며 대여일에서 제외(당일 반납 불가, 붙어 있는 예약은 충돌 아님), ③ 취소는 수령 전(pending/approved) 상태 기반으로 허용, ④ 연체는 저장 상태가 아닌 계산값(`picked_up` + 반납일 경과), ⑤ 승인 시점 겹침은 차단 대신 경고 표시(§3 그대로) — pending 예약도 가용 수량 차감, ⑥ 대여 신청에는 연락처 필수 — 미등록 시 물품 상세에서 프로필 입력으로 유도하고 서버도 400(`phone_required`)으로 강제(§4.1 수령·반납 연락 목적), ⑦ 개인정보 처리방침·서비스 이용약관 페이지 구현(`/policy/privacy`·`/policy/terms` — §9.1, 구글 OAuth 앱 게시 요건 충족용).
> - v2.11 (2026-09-11): **캘린더·가용 판정 정합성 수정.** ① 신청 INSERT 가드를 '구간과 겹치는 예약 건수' → **일별 동시 점유 검사**로 교체(§3·§8) — 수량 ≥ 2 물품에서 인접 예약 사이 구간이 UI(일별 점유 캘린더)에선 선택 가능한데 서버가 409로 거짓 거부하던 모델 불일치 제거. ② 캘린더가 **로컬 오늘 이전을 차단** — 서버 가용 창은 UTC라 KST 새벽 0~9시에 days[0]가 어제가 되어 완료 순간에야 '과거 날짜' 경고가 나던 균열 제거. ③ 범위 띠 배경을 `--color-primary-tint` 토큰으로 — 다크(순흑 위 12% 고정 알파는 사실상 비가시)·color-mix 미지원 브라우저 동시 해결. ④ 신청 성공 후 가용 갱신 실패가 성공 메시지를 에러 화면으로 덮지 않게(load quiet 모드), 409 거부 시 가용 현황 재조회. ⑤ 캘린더 비활성 **사유 라벨**(과거/전량 예약/최대 대여일 초과/구간 내 전량 예약) — 취소선은 '그날 자체 전량 예약'에만, 범례 추가. ⑥ 접근성: aria-live/role, 날짜 라벨에 요일·(오늘), roving tabindex + 방향키 이동, `:focus-visible`. ⑦ '다시 선택' 초기화 수단. ⑧ 대여 기간 선택을 네이티브 input 2개 → 커스텀 인라인 범위 캘린더(`x-calendar`)로 교체(§7.6). ⑨ 신청 INSERT를 **물품별 advisory 락 트랜잭션**으로 — '단일 문장이니 원자적'은 READ COMMITTED(문장 시작 스냅샷)에서 두 동시 신청의 직렬화를 보장하지 못해 이중 예약이 가능했다(§3·§8). ⑩ 관리자 승인 경고를 '확정 건과 겹친 건수' → '확정 예약만으로 이미 정원인 날 수'로 재정의 — 일별 점유 모델에서 같은 날 공존은 정상이라 구 기준은 매번 뜨는 무해한 소음이었다(§3). ⑪ 신청 도중 물품이 삭제된 경우(FK 위반)를 '수량 없음' 409가 아닌 404로 구분 — 오안내 제거.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 목적 | 청년지부 보유 물품(캠핑용품, 행사장비 등)의 대여 예약을 온라인으로 관리 |
| 이용자 | 지부 회원 (승인제) · 관리자 (운영진) |
| 물품 규모 | 약 50개 (카테고리 없음 — 검색으로 탐색, v2.5) |
| 예상 동시 이용자 | 동시 접속 수 명 수준 (지부 단위 소규모) |
| 운영 비용 | 월 0원 (Cloudflare 무료 티어 기반) |
| 운영 환경 | Cloudflare 대시보드 (호스팅·저장소·도메인) + Neon 콘솔 (DB) — 2곳 |
| 유지보수 | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱/서버 설치 불필요) |

## 2. 사용자 및 권한

| 역할 | 권한 |
|---|---|
| 미인증 방문자 | 물품 목록·상세 열람, 로그인 |
| 승인 대기 회원 | 마이페이지(승인 대기 상태 확인)만 접근 |
| 회원 (user, approved) | 물품 검색, 대여 신청, 내 예약 현황·이력 조회, 신청 취소 |
| 관리자 (manager) | 물품 등록/수정/삭제, 대여 신청 승인/거절, 수령·반납 처리, 회원 승인, 전체 대여 이력 조회 |
| 총관리자 (admin) | 관리자의 모든 권한 + 회원 역할 지정/해제 (여러 명 가능) |

- 회원가입: 구글 소셜 로그인(OAuth) → 최초 로그인 시 members 자동 생성(승인 대기) → 프로필(이름·연락처) 입력 → 관리자 승인 후 이용 가능
- 로그인 허용: `@jungto.org` 계정만 (예외는 `AUTH_ALLOWED_EMAILS` 시크릿에 콤마 구분으로 나열 — v2.9). 비허용 계정은 로그인 자체가 거부됨
- 로그인 세션: JWT 무상태 세션 (서명 검증 후 members 1회 조회로 최신 role/status 보정)
- 역할 지정/해제: 총관리자만 가능 (마지막 총관리자는 본인 포함 해임 불가, 미승인 회원은 임명 불가). 첫 총관리자는 DB 수동 지정 1회

## 3. 대여 상태 흐름 (핵심 플로우)

```
[물품 상세] 대여 기간 선택 → 신청(pending)
   → 관리자 승인(approved) ── 거절(rejected)
   → 수령(picked_up)
   → 반납(returned)          ── 예약일 전 취소(cancelled)
   → 반납일 지연 시 연체(overdue) 표시
```

- **가용성 판정** (v2.11 — 일별 동시 점유 기준): 신청 기간의 **매 대여일**마다 상태가 `pending/approved/picked_up`인 예약 수량 합 < `items.total_qty` 이면 신청 가능. 이전의 '구간과 겹치는 예약 건수' 기준은 수량 ≥ 2에서 인접 예약(붙어 있는 예약은 충돌 아님 — v2.10 ②)이 건수에 합쳐져 UI가 허용한 구간을 거짓 거부했음. 반납일은 점유에서 제외(반개구간 `[start, end)`)
- **이중 예약 방지**: 물품별 advisory 락(`pg_advisory_xact_lock`)을 잡은 트랜잭션 안에서 가용 검사 INSERT를 실행 — `INSERT ... SELECT ... WHERE NOT EXISTS(일별 점유 초과)`. 단일 문장의 원자성(all-or-nothing)만으로는 두 동시 신청의 직렬화가 보장되지 않는다 (READ COMMITTED에서 각 문장은 문장 시작 스냅샷을 쓰고, HTTP 드라이버는 무상태라 요청마다 별도 세션 — 락 없이는 둘 다 통과)
- 승인 시점에 확정 예약만으로 이미 정원인 날이 있으면 관리자에게 경고 표시 — 신청 가드가 pending까지 일별 점유로 세므로 정상 흐름에선 0이고, 0이 아니면 이상 상태(동시성 레이스·`total_qty` 인하)다
- 반납일 하루 전·연체 시 이메일 알림 (Workers Cron Trigger)

## 4. 기능 명세

### 4.1 회원
- 카카오 / 구글 OAuth 로그인 (Auth.js — 카카오 프로바이더 내장)
- 최초 로그인 후 프로필 입력: 이름, 연락처(휴대폰)
- 마이페이지: 대여 중 / 승인 대기 / 대여 예정 / 대여 이력 목록, 신청 취소
- 회원 탈퇴: 소프트 삭제 (대여 이력 보존을 위해 비활성화 처리)

### 4.2 물품
- 목록: 검색 + 대여 가능 여부 배지(대여 가능 / 대여 중 / 예약 있음). 카테고리 없음 — 검색(키워드+의미)으로 탐색 (v2.5)
  - 검색: 공백 구분 단어 전부 일치(AND) — **키워드 매치(이름·설명 ILIKE)를 먼저, 의미 매치(pgvector)를 그 뒤에 배치**
  - 의미 검색: Workers AI `@cf/baai/bge-m3`로 쿼리 임베딩 → 코사인 거리 상위 8개(거리 < 0.75) 물품을 키워드 매치에 없는 것만 추가. bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계(0.55)로 관련/무관 구분이 안 되므로 상대 랭킹으로만 사용 (실측). 임베딩은 물품 등록/수정 시 자동 생성(이름·설명), 실패 시 키워드 검색만 동작(폴백)
- 상세: 사진(최대 3장), 설명, 보유 수량, 대여 규칙(기본 대여일 수 등), 실시간 가용 일정
  - 사진은 업로드 전 브라우저에서 재인코딩(최장 변 1600px·WebP q80, 미지원 브라우저는 JPEG 폴백) — 원본 미보관, EXIF(위치정보) 제거, 파일당 통상 300KB 이하
- 관리자: 물품 등록/수정/삭제, 상태(정상/수리중/폐기) 관리, 사진 업로드(R2 — API 엔드포인트가 Workers R2 바인딩으로 직접 저장)

### 4.3 대여
- 신청: 날짜 범위 선택 → 겹침 검사 → 신청 (메모 입력 가능)
- 관리자 처리: 신청 목록에서 승인/거절(거절 사유 필수), 수령 체크, 반납 체크
- 연체: 반납일 경과 시 목록에 `연체` 배지 + 이메일 안내 (수동 반납 처리)
- 대여 기간 정책 파라미터화: 기본 7일, 설정 테이블에서 변경 가능

### 4.4 관리자
- 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수
- 회원 관리: 승인 대기 목록 → 승인/거절, 역할 지정/해제 (역할 변경은 총관리자만 — §2)
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
| `/` | 물품 목록 (검색·가능 여부) | 전체 |
| `/items/:id` | 물품 상세 + 대여 신청 폼 | 전체 (신청은 회원) |
| `/mypage` | 내 예약 현황·이력 | 회원 |
| `/login` | 소셜 로그인 | 전체 |
| `/signup/profile` | 이름·연락처 입력 (최초 1회) | 로그인 회원 |
| `/policy/privacy` | 개인정보 처리방침 | 전체 |
| `/admin` | 대시보드 | 관리자 |
| `/admin/items` | 물품 관리 | 관리자 |
| `/admin/reservations` | 대여 신청 승인·수령·반납 | 관리자 |
| `/admin/members` | 회원 관리 (승인·거절·역할) | 관리자 이상 (역할 변경은 총관리자) |

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
| 인증 | **Auth.js (@auth/core)** — 구글 OAuth + JWT 세션 (Hono에 수동 연동: `Auth(c.req.raw, config)`) | Workers 호환, HttpOnly 쿠키. 카카오는 v2 후보 |
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
2. 소셜 로그인: `POST /api/auth/signin/:provider` (CSRF 토큰 + `X-Auth-Return-Redirect` 헤더)로 OAuth URL을 받아 `window.location` **full-page redirect** → 콜백 후 SPA 복귀. @auth/core 0.41은 `GET /signin/:provider`를 지원하지 않으므로 반드시 POST 플로우 사용
3. JWT는 **HttpOnly + Secure + SameSite=Lax 쿠키** — 클라이언트 JS가 토큰에 접근 불가 (XSS 완화)
4. API가 401 반환 → fetch 래퍼가 세션을 `null`로 갱신 → 라우트 가드가 `/login`으로 이동
5. 승인 대기(status=pending) 회원은 `/mypage`만 허용

### 7.3 라우트 가드
- `router.ts`에서 @vaadin/router guard로 경로별 검사:
  - `/mypage`, `/signup/profile` → 로그인 필요
  - `/admin/*` → 로그인 + `role`이 manager 이상 (아니면 안내 화면)
- 가드 판단 기준은 모두 `/api/me` 응답값 (서버 권한 검사는 §8 미들웨어가 이중으로 강제)

### 7.4 API 엔드포인트
| 메서드 | 경로 | 설명 | 권한 |
|---|---|---|---|
| GET | `/api/me` | 세션 사용자 (없으면 200 + `{user:null}`) | 전체 |
| * | `/api/auth/*` | Auth.js 표준 (signin/callback/signout) | 전체 |
| GET | `/api/items?q=` | 물품 목록 + 가용 배지 (키워드+의미 검색) | 전체 |
| GET | `/api/items/:id` | 상세 + 사진 + 점유 기간 목록(향후 90일, 회원 정보 제외) | 전체 |
| POST | `/api/reservations` | 대여 신청 (원자적 INSERT — §8) | approved |
| GET | `/api/reservations/mine` | 내 예약 현황·이력 | approved |
| POST | `/api/reservations/:id/cancel` | 신청 취소 | 본인 |
| GET/POST/PUT/DELETE | `/api/admin/items` | 물품 CRUD (등록/수정 시 임베딩 자동 생성) | admin |
| POST | `/api/admin/items/:id/photos` | 사진 업로드 → R2 바인딩 | admin |
| GET | `/api/admin/reservations?status=` | 전체 예약 목록 | manager 이상 |
| POST | `/api/admin/reservations/:id/{approve,reject,pickup,return}` | 상태 처리 | manager 이상 |
| GET/POST | `/api/admin/members`, `/api/admin/members/:id/{approve,reject}` | 회원 목록·승인/거절 | manager 이상 |
| PUT | `/api/admin/members/:id/role` | 역할 지정/해제 (마지막 총관리자 보호) | admin |
| GET | `/api/admin/dashboard` | 오늘 수령/반납, 승인 대기, 연체 건수 | manager 이상 |

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

### 7.6 날짜 선택·가용 UI
- `x-calendar` (v2.11): 인라인 범위 캘린더 — 두 번 탭(첫 탭 시작일, 두 번 탭 반납일). 일별 점유(days×totalQty)로 전량 예약일을 미리 비활성화하되 반납일로는 선택 가능(반개구간), 로컬 오늘 이전 차단, 최대 대여일·구간 내 전량 예약 검사는 사유 라벨로 표기. roving tabindex + 방향키 이동, `:focus-visible`. v1의 네이티브 `<input type="date">` 2개 조합을 대체
- `availability-strip`: 서버가 내려준 점유 기간을 향후 90일 막대로 시각화 (점유일/잔여 수량)

## 8. 데이터베이스 설계 (Neon / PostgreSQL)

```sql
-- PostgreSQL 16 (Neon) — migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT,                              -- nullable — 최초 로그인 시 미수집, 프로필 입력에서 채움
  role       TEXT NOT NULL DEFAULT 'user',      -- user | manager | admin (v2.7 3단계)
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
  embedding   vector(1024),                   -- 의미 검색 (pgvector) — 등록/수정 시 자동 생성
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

**가용 수량 쿼리 (이중 예약 방지 — v2.11 일별 동시 점유 기준 + 물품별 advisory 락)**:
```sql
-- 한 트랜잭션 (neon HTTP 드라이버의 transaction([...]) — 락은 커밋/롤백 시 자동 해제)
SELECT pg_advisory_xact_lock($1::bigint);          -- 물품별 직렬화 지점

INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo)
SELECT $1, $2, $3, $4, $5
WHERE NOT EXISTS (
  -- 요청 기간의 매 대여일마다 동시 점유 수량 확인 — 하루라도 전량 점유면 거절
  SELECT 1
  FROM generate_series($3::date, $4::date - 1, interval '1 day') AS d(day)
  JOIN reservations r
    ON r.item_id = $1
   AND r.status IN ('pending','approved','picked_up')
   AND r.start_date <= d.day::date
   AND r.end_date > d.day::date
  GROUP BY d.day
  HAVING COUNT(*) >= (SELECT total_qty FROM items WHERE items.id = $1)
)
RETURNING id;
-- NOT EXISTS 실패 (하루라도 전량 점유) → affected rows = 0 → 신청 거절 (API는 409 반환)
-- 락이 두 동시 신청을 직렬화한다 — 락 없이 단일 문장만으로는 READ COMMITTED 스냅샷 때문에
-- 둘 다 통과할 수 있다 (구 버전의 '단일 문장이니 원자적' 주장은 이 점에서 부정확했음)
```

**연결 방식**: `@neondatabase/serverless` HTTP 드라이버 (fetch 기반) — Workers 무료 플랜에서 동작, TCP/Hyperdrive 불필요. HTTP 모드는 무상태이므로 요청마다 클라이언트를 생성해도 안전. `DATABASE_URL`은 배포 시 `wrangler secret put`, 로컬 개발은 `.dev.vars`/.env로 관리.

**권한 처리 (애플리케이션 레벨)**: Hono 미들웨어에서 통일 강제 —
- `requireAuth`: 세션 JWT 검증
- `requireApproved`: `status='approved'` 회원만 예약 API 접근
- `requireManager`: role이 manager/admin만 `/api/admin/*` 운영 라우트 접근 (물품·대여·회원 승인)
- `requireAdmin`: role이 admin만 역할 지정/해제 등 관리자 관리 기능 접근
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
