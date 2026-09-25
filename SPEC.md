# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

지부 회원(계정제)이 보유 물품을 검색해 수량과 메모로 대여하고, 반납은 회원이 직접 또는 관리자가 처리하는 소규모 서비스. Cloudflare(Workers·D1·R2·Workers AI) 위에서 동작한다.

이 문서는 **무엇을, 어떻게 동작하는가**(도메인 규칙·API·스키마·설계 결정)를 다룬다. 빌드·배포·개발 명령은 [README.md](README.md)를 본다.

## 1. 프로젝트 개요

| 항목             | 내용                                                                |
| ---------------- | ------------------------------------------------------------------- |
| 목적             | 지부 보유 물품(캠핑용품, 행사장비 등)의 대여를 온라인으로 관리      |
| 이용자           | 지부 회원 · 관리자(운영진)                                          |
| 물품 규모        | 약 100개 (대여품 + 소모품) — 카테고리 + 검색으로 탐색               |
| 예상 동시 이용자 | 수 명 수준 (지부 단위 소규모)                                       |
| 운영 환경        | Cloudflare 단일 콘솔 (Workers·D1·R2·Workers AI)                     |
| 운영 비용        | 월 0원 (전부 무료 티어 — §9)                                        |
| 유지보수         | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱·서버 설치 불필요)      |

## 2. 사용자·권한·인증

| 역할                    | 권한                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| 미인증 방문자           | 물품 목록·상세·검색 열람, 로그인                                                 |
| 회원 (`user`)           | 물품 검색, 대여, 내 대여 현황·이력 조회, 반납, 대여 취소                         |
| 관리자 (`admin`)        | 물품 CRUD·사진 관리, 대여 반납 처리, 회원 탈퇴 처리, 관리자 지정/해제, 허용 이메일 관리 |

### 2.1 가입과 로그인

- **로그인이 곧 가입** — 구글 OAuth 최초 로그인 시 `members` 자동 생성 → 프로필(이름·연락처) 입력 → 바로 이용. 승인 단계가 없다
- **허용 범위**: `@jungto.org` 계정. 예외 이메일은 어드민 허용 이메일 페이지(DB `allowed_emails`)에서 관리하고, `AUTH_ALLOWED_EMAILS` 시크릿은 DB 장애 시 관리자 접속용 비상 폴백으로 병행한다 (auth.ts — env 판정을 먼저 하므로 정토회·env 계정은 DB 없이도 로그인된다)
- 비허용 계정은 로그인 단계에서 거부되며, 이메일은 PII라 로그에 남기지 않는다

### 2.2 세션

- Auth.js JWT — **HttpOnly + Secure + SameSite=Lax 쿠키**, 클라이언트 JS가 토큰에 접근 불가
- JWT `sub`는 members.id. **요청마다 members를 재조회**해 최신 role/탈퇴 여부를 반영한다 — 역할 변경·탈퇴가 즉시 전파되고 재로그인이 불필요하다
- 탈퇴 회원(`deactivated_at` 있음)은 세션 조회에서 제외 — 남은 쿠키로 모든 API가 401
- 상태 변경 요청은 Origin 헤더가 호스트와 같은지 검사한다 (SameSite의 보조 방어선 — index.ts)

### 2.3 역할 관리

- 지정/해제는 관리자 누구나. **마지막 관리자는 본인 포함 해임·탈퇴 불가** — 서버가 가드 UPDATE로 원자 거부(409 `last_admin`). 탈퇴(deactivated)된 관리자는 활성 수에서 제외해 센다
- 첫 관리자만 DB 수동 지정 (README 참고)
- 회원 탈퇴는 소프트 삭제 — `deactivated_at`만 기록하고 대여 이력은 보존. 복구 경로 없음

## 3. 대여 도메인 규칙 (핵심)

```
[물품 상세] 수량·메모 입력 → 대여(rented)
   → 반납(returned)   ← 회원이 직접 누르거나 관리자가 처리
   → 취소(cancelled)  ← 빌리지 않기로 함
```

- **기간 개념이 없다** — 날짜·최대 대여일·승인 단계를 두지 않는다. 신청하면 즉시 대여 중
- **가용성**: `rentable_qty = total_qty - qty_broken` (수리중 수량 제외). **현재 `rented` 수량 합 + 신청 수량 ≤ `rentable_qty`** 이면 가능. 반납·취소 수량은 점유에서 빠져 즉시 재대여 가능
- **이중 대여 방지 (D1/SQLite)**: 가용 검사·상태 검사·INSERT를 **조건부 `INSERT ... SELECT ... WHERE ... RETURNING` 단일 문장**(가드 INSERT)으로 원자 수행한다. SQLite 단일 라이터 + 문장 원자성 덕에 두 동시 신청이 같은 잔여 수량을 읽고 둘 다 INSERT 되는 끼어들기가 없다. `RETURNING` 0행이면 성공으로 오인하지 않고 재조회해 404/409 원인을 가린다 (reservations.service.ts)
- **반납 주체 구분**: 회원 직접 반납은 `admin_id`를 비워 둔다 — 관리자 목록이 "회원이 직접 반납(자기 신고)"으로 표시해 물품 회수 확인 대상이 된다. 관리자 반납은 처리한 관리자를 기록
- **취소 ≠ 반납**: 취소는 "빌리지 않기로 함", 반납은 "돌려줬음". 둘 다 재고를 즉시 되돌리지만 이력에서 구분된다
- **연체 개념 없음** — 이메일 알림도 없다. 관리자는 대시보드 '대여 중' 목록으로 미반납 건을 파악한다
- 대여 신청엔 연락처가 필요하다 — 미등록 회원은 400(`phone_required`), 화면이 프로필 입력으로 유도

### 3.1 원자성이 요구되는 쓰기 (설계 규칙)

여러 문장이 하나의 논리적 변경이면 **D1 batch(단일 트랜잭션)로 묶는다**. 실패 시 부분 상태가 남지 않는다.

| 작업               | 원자 단위                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| 대여 생성          | 가드 INSERT 단일 문장 (재고·상태·점유 합을 INSERT 시점에 재검사)        |
| 마지막 관리자 보호 | 해임·탈퇴 UPDATE의 WHERE 절 안에서 "다른 활성 관리자 존재" 검사         |
| 물품 등록          | items + item_categories + items_fts 를 batch 한 장으로 (FK 위반 시 전체 롤백) |
| 물품 수정          | 컬럼 갱신 + 태그 교체 + FTS 동기화를 batch 한 장으로                    |
| 사진 업로드        | 개수 상한을 INSERT 가드로 검사 — R2 업로드 실패 시 슬롯 환수            |

batch 문장 사이의 새 물품 id 참조는 `last_insert_rowid()`(문장마다 덮어써짐) 대신 `(SELECT MAX(id) FROM items)` — batch는 하나의 트랜잭션이라 도중 끼어들기가 없고 INSERT 직후라 MAX(id)가 방금 넣은 행이다. 이 동작들은 실 SQLite(node:sqlite) 통합 테스트가 검증한다 (server/tests/sqlite.integration_test.ts).

## 4. 기능 명세

### 4.1 물품

- **목록(탐색)**: 폐기(`retired`) 제외 전체, 최근 등록순, OFFSET/LIMIT 무한스크롤(1페이지 24개·최대 60). 가용 배지 3종 — `available` / `rented`(대여 중) / `repair`(상태가 repair 또는 rentable_qty ≤ 0). 소모품은 배지 없음
- **카테고리(태그)**: 다대다(`categories` × `item_categories`). 회원 화면엔 검색·상세에만 보이고 필터는 없다. 등록·수정 중 태그 칩 에디터로 만들고, 관리(추가·이름변경·삭제)는 `/admin/items`의 카테고리 관리 모달. 삭제 시 조인 행만 사라지고 물품은 남는다
- **속성**: `kind`(rental/consumable), `location`(보관 위치), `qty_broken`(수리중 수량) — 전부 선택 항목. `qty_broken ≤ total_qty`는 DB CHECK가 강제
- **소모품은 대여 대상이 아니다** — 상세에 신청 폼 대신 안내와 보유 수량만 보여주고, API 직접 신청도 409(`consumable`)로 거부
- **상세**: 사진(최대 3장), 설명, 위치, 실시간 잔여 수량. 대여 수량은 1 ~ 현재 대여 가능 수량
- **사진**: 업로드 전 브라우저에서 재인코딩(최장 변 1600px·WebP q80, EXIF 제거). 서버가 형식(JPEG/PNG/WebP)·2MB·1600px 픽셀을 재검사해 API 우회를 막는다. R2 키에 UUID가 포함되어 불변 — 1년 캐시로 서빙
- **관리자 CRUD**: 등록/수정 시 FTS 행과 임베딩이 자동 갱신(임베딩 실패는 키워드 검색으로 폴백). 삭제는 대여 이력이 있으면 409 — 폐기 상태 전환 권장. 삭제 시 R2 오브젝트도 함께 제거(일부 실패 시 고아 오브젝트는 회수 가능 — 행만 남는 것보다 낫다)

### 4.2 회원

- 마이페이지(프로필 편집) + 대여 내역(`my/rentals` — 대여 중/이력, 반납·취소)
- 탈퇴는 관리자가 처리. 대여 중인 건은 본인이 반납할 수 없으므로 관리자가 먼저 반납 처리해야 한다

### 4.3 관리자

- **대시보드**: 전체 물품 상태 + 현재 대여자(이름·연락처·수량) 목록
- **대여 관리**: 전체 대여 목록(대여 중 우선, 500건 절단 표시), 반납 처리, 회원 직접 반납 확인
- **회원 관리**: 목록, 역할 지정/해제(마지막 관리자 보호), 탈퇴 처리
- **허용 이메일**: `@jungto.org` 외 로그인 허용 계정 관리 (§2.1)

## 5. 검색 설계

**3개 랭킹의 RRF(Reciprocal Rank Fusion) 융합** — `score = Σ 1/(60+rank)`, 여러 랭킹에 걸친 물품이 위로 온다. 상위 30개만 내리고, 검색에는 페이지네이션이 없다(퍼지 매치 꼬리는 노이즈).

1. **키워드(FTS5)**: 3글자 이상 토큰 — `items_fts`(trigram, rowid = items.id) `MATCH` + `bm25()`. 토큰은 AND. 검색 대상은 이름·설명·위치·카테고리 이름
2. **LIKE 폴백**: 1-2글자 토큰(텐트·매트)은 trigram 생성 불가 — 이름 ×3·위치/태그 ×2·설명 ×1 가중치 점수로 별도 랭킹. `%`·`_`·`\` 는 ESCAPE로 무력화
3. **의미**: 쿼리를 Workers AI `@cf/baai/bge-m3`(1024차원)로 임베딩 → 물품 벡터(D1 BLOB 1024×f32 LE, isolate 메모리 캐시) 전수 JS 코사인 상위 8개(유사도 ≥ 0.25). bge-m3 유사도는 0.4~0.65에 뭉쳐 절대 임계로는 관련/무관을 가르지 못해 상대 랭킹으로만 사용

안전·성격:
- FTS5 MATCH 구문 주입 차단 — 토큰을 큰따옴표로 감싸 리터럴화(`"`는 `""`로 이중화), AND·NEAR 같은 예약어도 검색어가 된다
- 쿼리 임베딩은 isolate 메모리에 100개까지 캐시(정규화된 검색어 키) — 반복 검색이 Workers AI를 다시 부르지 않는다
- 공개 엔드포인트라 IP당 분당 30회 레이트 리밋(isolate 로컬 고정창 — 정확한 계정 제한은 아니지만 AI 비용 폭주 1차 방어)
- 의미 검색 실패 시 키워드 결과만으로 검색이 계속된다(폴백)
- 임베딩은 물품 등록/수정 시 자동 생성. DB 직접 INSERT 뒤엔 `POST /api/admin/reembed-all` 백필 필요 (README 참고)
- 확장 한계: 벡터 전수 코사인 + isolate 캐시는 수백~수천 물품까지 적합. 그 이상은 Cloudflare Vectorize 검토

## 6. API 레퍼런스

| 메서드              | 경로                                        | 설명                                                          | 권한   |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------ |
| GET                 | `/api/health`                               | 헬스체크                                                      | 전체   |
| GET                 | `/api/me`                                   | 세션 사용자 (없으면 200 + `{user:null}` — SPA가 로그인 판단)  | 전체   |
| *                   | `/api/auth/*`                               | Auth.js 표준 (signin/callback/signout, 자체 CSRF 검증)        | 전체   |
| PUT                 | `/api/me/profile`                           | 이름·연락처 입력                                              | 로그인 |
| GET                 | `/api/items?q=&limit=&offset=&available=1`  | `q` 있으면 검색(상위 30)·없으면 탐색 목록 + total 배지        | 전체   |
| GET                 | `/api/items/:id`                            | 상세 + 사진 + 가용 배지                                       | 전체   |
| GET                 | `/api/categories`                           | 카테고리 목록(이름·물품 수)                                   | 전체   |
| GET                 | `/api/photos/*`                             | R2 사진 서빙 (1년 캐시, `X-Content-Type-Options: nosniff`)    | 전체   |
| POST                | `/api/reservations`                         | 대여 (가드 INSERT 원자 검사)                                  | 로그인 |
| GET                 | `/api/reservations/mine`                    | 내 대여 현황·이력                                             | 로그인 |
| POST                | `/api/reservations/:id/cancel`              | 대여 취소 (본인 + rented)                                     | 본인   |
| POST                | `/api/reservations/:id/return`              | 반납 (본인 + rented — admin_id 비움)                          | 본인   |
| GET/POST/PUT/DELETE | `/api/admin/items[/:id]`                    | 물품 CRUD — 전달 필드만 갱신, allow-list 검증                 | admin  |
| POST/DELETE         | `/api/admin/items/:id/photos[/:photoId]`    | 사진 업로드(검증 3중)·삭제                                    | admin  |
| POST/PUT/DELETE     | `/api/admin/categories[/:id]`               | 카테고리 생성·이름변경·삭제                                   | admin  |
| GET                 | `/api/admin/reservations?status=`           | 전체 대여 목록 (대여 중 우선, 절단 여부 포함)                 | admin  |
| POST                | `/api/admin/reservations/:id/return`        | 반납 처리 (admin_id 기록)                                     | admin  |
| GET                 | `/api/admin/members`                        | 회원 목록                                                     | admin  |
| POST                | `/api/admin/members/:id/withdraw`           | 탈퇴 처리 (소프트 삭제, 마지막 관리자 보호)                   | admin  |
| PUT                 | `/api/admin/members/:id/role`               | 역할 지정/해제 (마지막 관리자 보호)                           | admin  |
| GET/POST/DELETE     | `/api/admin/allowed-emails[/:id]`           | 허용 이메일 관리                                              | admin  |
| GET                 | `/api/admin/dashboard`                      | 전체 물품 상태 + 현재 대여자                                  | admin  |
| POST                | `/api/admin/reembed-all`                    | 임베딩 백필 (호당 15건, `next_after` 커서)                    | admin  |

에러 계약: 본문 `{error: code}` — 기계용 코드(`no_availability`, `too_many`, `phone_required`, `last_admin` 등). 화면 분기는 코드로 하고 메시지 문자열을 파싱하지 않는다.

## 7. 데이터베이스 (D1 / SQLite)

권위 있는 DDL은 `migrations-d1/`(0001_baseline이 현재 최종 형태)이다 — 이 절은 요약만 한다.

| 테이블            | 역할                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `members`         | id TEXT(random hex) · email UNIQUE · role(user/admin) · phone nullable · `deactivated_at`(소프트 삭제) |
| `items`           | id INTEGER PK(rowid = FTS rowid) · status(active/repair/retired) · kind(rental/consumable) · total_qty · qty_broken(CHECK ≤ total_qty) · location · `embedding` BLOB(1024×f32 LE) · source_key(부분 UNIQUE — 시트 재수입 멱등 키) |
| `item_photos`     | item_id FK CASCADE · r2_key · sort_order (등록순 = 대표 사진)         |
| `reservations`    | status(rented/returned/cancelled) · qty(CHECK ≥ 1) · member_memo · admin_id(회원 반납이면 NULL) |
| `categories`      | name UNIQUE                                                          |
| `item_categories` | (item_id, category_id) PK — 다대다                                   |
| `allowed_emails`  | email UNIQUE · note · created_by                                     |
| `items_fts`       | FTS5 trigram(name, description, location, tags) — 앱이 DELETE+INSERT 동기화 |

시각은 전부 ISO 8601(ms, Z) TEXT — JSON 응답 형태가 Postgres 시절과 동일하다.

## 8. 아키텍처·보안 설계

- **단일 워커**: `/api/*`는 워커(`run_worker_first`), 나머지는 Static Assets SPA 폴백. 사진만 `/api/photos/*`로 R2 스트리밍
- **계층**: routes(HTTP·입력 검증) → services(SQL·도메인) 2단. SQL은 services에만 둔다(ast-grep `no-sql-in-code` 규칙). 동적 SQL 컬럼은 라우트 allow-list가 검증한 키로만 조립
- **입력 클램프**: LIMIT/OFFSET·id·수량 등은 정수 클램프 후 SQL 반영. 텍스트는 길이 상한(이름 200, 본문 2000, 메모 500)
- **클라이언트 동시성**: item-detail·home 목록은 세대(gen) 카운터로 늦은 응답을 폐기. 세션 스토어는 inflight dedup + 401만 비로그인 확정(5xx는 캐시 유지, 첫 로드 실패 시 가드가 /login으로 밀지 않음)
- **모달 접근성**: 포커스 트랩(라이트+섀도)·복귀, Esc·Tab은 열린 스택의 최상위 모달만 처리
- **백업**: D1 Time Travel(최근 30일 시점 복구)이 기본. 장기 보관이 필요하면 `wrangler d1 export` 주기 실행을 권장

## 9. 무료 티어 한계 (2026-09 기준)

| 서비스        | 한도 요약                                             | 판정     |
| ------------- | ----------------------------------------------------- | -------- |
| Workers       | 요청 100,000/일, CPU 10ms/요청                        | ✅ 여유  |
| D1            | 저장 5GB, 행 읽기 500만/일, 행 쓰기 10만/일           | ✅ 여유  |
| R2            | 저장 10GB, 이그레스 무료                              | ✅ 여유  |
| Workers AI    | bge-m3 무료 할당 (Neuron 기반, 속도 제한)             | ✅ 여유 — 임베딩 캐시로 호출 최소화 |

**총 운영 비용: 월 0원** (커스텀 도메인 사용 시 연 약 2만원 선택)

## 10. SPA 라우트

| 경로                                               | 화면                                                 | 접근               |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------ |
| `/`                                                | 물품 목록 (검색·가용 배지·무한스크롤)                | 전체               |
| `/items/:id`                                       | 물품 상세 + 대여 (관리자는 편집·사진 관리)           | 전체 (대여는 회원) |
| `/login`, `/signup/profile`                        | 로그인 / 프로필 입력                                 | 전체 / 로그인      |
| `/mypage`                                          | 프로필 편집                                          | 로그인             |
| `/my/rentals`                                      | 내 대여 내역 (반납·취소)                             | 로그인             |
| `/policy/privacy`, `/policy/terms`                 | 개인정보 처리방침·이용약관                           | 전체               |
| `/admin` · `/admin/items` · `/admin/reservations` · `/admin/members` · `/admin/allowed-emails` | 관리자 화면들 | admin |
| `(.*)`                                             | 404 화면                                             | 전체               |

라우트별 코드 스플릿 — 관리자 청크는 일반 방문자에게 내려가지 않는다. 가드(`/mypage*`, `/admin/*`)는 UX이고 실제 권한은 서버가 이중 강제한다.

## 11. 비기능 요구사항

1. **개인정보 최소 수집**: 이름·연락처만. 연락처는 대여 연락 목적으로만 사용. 처리방침·약관 페이지 제공 (`/policy/*`)
2. **보안**: 시크릿 4개만 관리(AUTH_* — README 참고). JWT HttpOnly + 요청마다 권한 재조회 + Origin 검증 + FTS/LIKE 주입 차단 + 업로드 3중 검사 + 검색 레이트 리밋
3. **번들 예산**: 초기 로드 gzip 150KB 이하. 사진은 R2에서 지연 로딩
4. **반응형**: 모바일 우선 — 대여 신청은 휴대폰에서 이루어질 것으로 가정
5. **브라우저 지원**: 모던 브라우저 최신 2버전 (Shadow DOM 기본 지원 범위)
6. **테스트**: 단위(Sql 스텁 — SQL 형태 단언) + 통합(node:sqlite 실DB — 가드·원자성·FTS 동작 검증)

## 12. 향후 확장

- QR 코드로 물품 식별·대여/반납 처리 (관리자 스마트폰)
- 물품별 대여 통계 대시보드
- 장기 미반납 표시 (`created_at` 경과일 기준 — 반납 기한 개념은 되살리지 않음)
- Cloudflare Access로 관리자 페이지 이중 보호
- PWA (오프라인 캐시, 홈 화면 추가)
- 물품이 수천 개를 넘으면 Vectorize 전환 검토 (§5)
