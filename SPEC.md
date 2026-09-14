# 청년지부 물품 대여 사이트 — 사양서 (SPEC)

버전: v3.1 (2026-09-14) · 규모: 소규모 (물품 97개) · 대상: 지부 회원 (계정제) · 플랫폼: Cloudflare (호스팅·저장소) + Neon (PostgreSQL DB)

> **변경 이력**
>
> - v1.1 (2026-09-03): Supabase/Vercel → Cloudflare(Workers + D1 + R2) 전면 교체. 인증은 Auth.js로 자체 구현.
> - v2.0 (2026-09-08): **클라이언트를 Hono JSX 서버 렌더링 → 순수 Lit SPA로 전면 교체.** 서버는 Hono JSON API 전용(JSX 렌더링 제거). 스타일은 Tailwind → Lit `css` 템플릿 + CSS 커스텀 프로퍼티 디자인 토큰(Shadow DOM 캡슐화 유지).
> - v2.1 (2026-09-08): **DB를 D1(SQLite) → Neon(PostgreSQL)으로 교체.** 연결은 `@neondatabase/serverless` HTTP 드라이버(fetch 기반, Workers 친화). 백업은 주간 `pg_dump` 주도로 변경. 런타임은 여전히 workerd — Deno는 패키지 매니저/개발 도구 역할.
> - v2.2 (2026-09-08): **로그인 구현 — 구글 OAuth 단일 프로바이더** . Auth.js JWT 세션 검증 후 members를 1회 조회해 최신 role/status를 반영 (무상태 JWT + 권한 변경 즉시 반영). 프로필 입력 API(`PUT /api/me/profile`) 추가.
> - v2.3 (2026-09-09): **의미 검색 도입.** 물품 등록/수정 시 Cloudflare Workers AI `@cf/baai/bge-m3`(다국어, 무료)로 임베딩 자동 생성 → Neon **pgvector** `vector(1024)` 컬럼 저장. 검색은 키워드 매치(ILIKE 이름·설명) 우선 + 의미 유사 물품(거리 상위 8개)을 뒤에 추가 — 절대 거리 임계는 관련/무관 구분력이 부족해 상대 랭킹으로 대체 (실측). 키워드 검색 이름만 → 설명 확장. members.phone nullable (최초 로그인 시 미수집).
> - v2.4 (2026-09-09): **카테고리 완전 제거.** LLM 자동 분류(이날 시도했다가 제거)조차 새 카테고리 생성·이름 관리라는 새 관리 포인트를 만들므로, 카테고리 테이블·컬럼·칩·분류기를 전부 제거하고 탐색을 검색(키워드+의미)으로 완전 대체. 홈은 검색바 + 전체 그리드. 등록 폼은 이름·설명·수량·상태만.
> - v2.5 (2026-09-09): **임베딩 백필 제거 + 등록 흐름 정리.** 등록/수정 시 자동 생성만으로 충분해 관리자 "임베딩 일괄 생성" 버튼과 `/api/admin/items/embeddings/backfill` 엔드포인트 삭제. AI 호출 실패로 임베딩이 빠진 물품은 재수정 시 자동 재생성으로 복구. 물품 등록 저장 후 자동으로 편집 모드로 전환해 사진을 바로 올릴 수 있게 함 (사진 API는 물품 id 기반이라 저장 전에는 불가).
> - v2.6 (2026-09-09): **등록 저장 1회 클릭 완료.** 등록 폼에서 사진을 직접 고르게 된(v2.5 후반) 시점부터 저장 후 편집 모드 전환은 불필요 — 성공 시 목록으로 바로 복귀하고, 사진 업로드 실패 시에만 편집 모드를 유지해 재업로드. 저장 진행 중 저장 버튼 비활성화("저장 중…" 표시)로 느린 요청(Neon 콜드스타트 등) 시 재클릭으로 인한 물품 중복 등록 방지.
> - v2.7 (2026-09-09): **역할 3단계 + 회원 관리 화면.** role을 `admin`(총관리자) > `manager`(관리자) > `user`(회원) 3단계로 확장. 총관리자는 역할 지정/해제(여러 명 가능 — 마지막 총관리자는 본인 포함 해임 불가, 미승인 회원은 임명 불가), 관리자는 물품·대여·회원 승인 운영. 기존 `member` 값은 `user`로 이관(마이그레이션 0006). `/admin/members` 회원 관리 화면과 API(목록·승인/거절은 manager 이상, `PUT /:id/role`은 admin 전용) 신설. 승인 대기 회원 행에는 역할 셀렉트 대신 배지를 보여 승인 선행이 화면에서 자명하게. 첫 총관리자는 기존처럼 DB 수동 지정.
> - v2.8 (2026-09-09): **헤더 네비에 물품 대여(홈) 링크 추가.** 기존엔 로고("물품 대여")만이 홈 링크라 일반 회원·익명 방문자에게 물품 목록 진입점이 메뉴에 없었음 — 전체 방문자 대상 첫 메뉴로 추가.
> - v2.9 (2026-09-10): **로그인 이메일 제한.** `@jungto.org` 계정만 로그인 허용, 나머지는 Auth.js `signIn` 콜백에서 차단(members 생성도 하지 않음) 후 `/login?error=AccessDenied`로 복귀 — 로그인 화면에 "정토회 계정(@jungto.org)으로 로그인해주세요" 표시. 운영진 개인 계정 등 예외는 `AUTH_ALLOWED_EMAILS` 시크릿(콤마 구분)으로 허용.
> - v2.10 (2026-09-10): **대여 플로우 구현** (마일스톤 3단계). 회원: 물품 상세에서 기간 선택해 신청, 마이페이지 그룹 목록(대여 중/승인 대기/대여 예정/이력)·취소. 관리자: `/admin/reservations` 목록(상태 필터)·승인(겹침 경고 confirm)/거절(사유 필수, status_note 기록)/수령/반납. 세부 결정: ① 대여 기간 상한은 `items.max_days` 기준(settings.max_rental_days 미사용), ② 날짜는 반개구간 `[start, end)` — end_date는 반납일이며 대여일에서 제외(당일 반납 불가, 붙어 있는 예약은 충돌 아님), ③ 취소는 수령 전(pending/approved) 상태 기반으로 허용, ④ 연체는 저장 상태가 아닌 계산값(`picked_up` + 반납일 경과), ⑤ 승인 시점 겹침은 차단 대신 경고 표시(§3 그대로) — pending 예약도 가용 수량 차감, ⑥ 대여 신청에는 연락처 필수 — 미등록 시 물품 상세에서 프로필 입력으로 유도하고 서버도 400(`phone_required`)으로 강제(§4.1 수령·반납 연락 목적), ⑦ 개인정보 처리방침·서비스 이용약관 페이지 구현(`/policy/privacy`·`/policy/terms` — §9.1, 구글 OAuth 앱 게시 요건 충족용).
> - v2.11 (2026-09-11): **캘린더·가용 판정 정합성 수정.** ① 신청 INSERT 가드를 '구간과 겹치는 예약 건수' → **일별 동시 점유 검사**로 교체(§3·§8) — 수량 ≥ 2 물품에서 인접 예약 사이 구간이 UI(일별 점유 캘린더)에선 선택 가능한데 서버가 409로 거짓 거부하던 모델 불일치 제거. ② 캘린더가 **로컬 오늘 이전을 차단** — 서버 가용 창은 UTC라 KST 새벽 0~9시에 days[0]가 어제가 되어 완료 순간에야 '과거 날짜' 경고가 나던 균열 제거. ③ 범위 띠 배경을 `--color-primary-tint` 토큰으로 — 다크(순흑 위 12% 고정 알파는 사실상 비가시)·color-mix 미지원 브라우저 동시 해결. ④ 신청 성공 후 가용 갱신 실패가 성공 메시지를 에러 화면으로 덮지 않게(load quiet 모드), 409 거부 시 가용 현황 재조회. ⑤ 캘린더 비활성 **사유 라벨**(과거/전량 예약/최대 대여일 초과/구간 내 전량 예약) — 취소선은 '그날 자체 전량 예약'에만, 범례 추가. ⑥ 접근성: aria-live/role, 날짜 라벨에 요일·(오늘), roving tabindex + 방향키 이동, `:focus-visible`. ⑦ '다시 선택' 초기화 수단. ⑧ 대여 기간 선택을 네이티브 input 2개 → 커스텀 인라인 범위 캘린더(`x-calendar`)로 교체(§7.6). ⑨ 신청 INSERT를 **물품별 advisory 락 트랜잭션**으로 — '단일 문장이니 원자적'은 READ COMMITTED(문장 시작 스냅샷)에서 두 동시 신청의 직렬화를 보장하지 못해 이중 예약이 가능했다(§3·§8). ⑩ 관리자 승인 경고를 '확정 건과 겹친 건수' → '확정 예약만으로 이미 정원인 날 수'로 재정의 — 일별 점유 모델에서 같은 날 공존은 정상이라 구 기준은 매번 뜨는 무해한 소음이었다(§3). ⑪ 신청 도중 물품이 삭제된 경우(FK 위반)를 '수량 없음' 409가 아닌 404로 구분 — 오안내 제거.
> - v3.0 (2026-09-14): **실물 데이터 입력 — 물품 속성 확장 + 과거 대여 이력 + 수량 기반 가용성.** ① `items` 에 `location`(보관 위치)·`size`·`color`·`qty_broken`(수리중 수량)·`note`·`kind`(rental 대여품 / consumable 소모품)·`source_key` 추가(0008~0010). 시트의 '분류'는 v2.4 의 검색 대체 결정과 어긋나지 않게 받지 않고 **보관 위치만 채택**. ② v2.4 가 **테이블만 지우고 남겨 둔 `items.category` TEXT 컬럼을 제거**(0011) — 카테고리 테이블은 0005 에서 사라졌지만 컬럼과 `ITEM_CATEGORIES`(13값)·관리자 등록 폼의 분류 셀렉트·분류 칩·`?category=` 파라미터가 살아 있어 v2.4 결정이 실제 화면에서는 지켜지지 않고 있었다. ③ `reservations.qty` 추가(0009) — 예약을 건수가 아닌 수량 단위로. 가용 판정이 `SUM(qty)` 기준으로 바뀌고, **대여 가능 수량은 `total_qty - qty_broken`**(`rentable_qty`)이다 (수리중 수량은 재고에서 제외 — §3·§8). ④ `rental_history` 신설(0012) — 2025 청년페스타 '물품대여' 시트 216건을 참고용 스냅샷으로 적재. FK 를 강제하지 않으므로 `reservations` 에 합치지 않는다(§8). ⑤ **임베딩 백필 `npm run db:reembed`** 추가 — 시트 일괄 반영은 DB 직접 INSERT 라 임베딩이 비어(92건 중 70건) 목록 쿼리의 `embedding IS NOT NULL` 필터에 걸려 **의미 검색에서 조용히 누락**되고 있었다. 등록/수정 API 를 거치지 않는 일괄 입력 뒤에는 반드시 실행한다. ⑥ 이메일 알림(`§4.5`)·Resend·Cron Trigger 를 사양에서 제거 — 발송 수단 없이 연체는 계산 배지로만 표시하고 알림은 §12 후보로 남긴다 (`wrangler.jsonc` 의 `triggers.crons` 는 정리 대상).
> - v3.1 (2026-09-14): **수량 기반 가용성 구현 완료 + 실물 데이터 정리.** ① **수량 부분 대여 구현** — 물품 상세에서 잔여 수량까지 골라 신청하고, 신청자 화면(홈 카드·상세·마이페이지)과 관리자 화면(대시보드·예약 목록)이 모두 `SUM(qty)` 기준 수량을 보여준다. 관리자는 승인 시 수량을 **줄일 수 있고**(늘리기는 400 `qty_increase_not_allowed`) 목록의 `정원 초과 N일` 배지 + 승인 confirm 으로 경고한다. ② **신청 INSERT 가드의 구멍 수정** — 재고 대비 `qty` 자체를 검사하는 조건을 `NOT EXISTS` **바깥**으로 옮겼다. 안쪽 `HAVING` 은 겹치는 예약이 하나도 없으면 평가될 행 자체가 없어 통과하므로, 겹치는 예약이 없는 상태에서 재고보다 큰 `qty` 가 그대로 INSERT 됐다(실측: 재고 7에 `qty=8` 수락). 이는 사전 검사(`qty > rentable`)와 INSERT 사이에 관리자가 수량을 줄인 경쟁 조건을 막으려던 목적 자체가 새던 자리다(§3·§8). ③ **실물 데이터 정리** — 검증용 임시 물품 21건(+예약 3건) 삭제, 회관물품 26건(`XA1001`~`XA1026`) 등록, 시트 내장 사진 25장 이관(1600px WebP q80). 시트에 수량이 없던 5건은 잠정 10개 + 비고로 등록. 물품 92 → 97건(대여품 93·소모품 4). ④ **등록 폼에 보관 위치 칸 추가**(§4.2) — 보관 위치는 물품마다 값이 갈리는 속성이라 편집 폼에만 두면 등록 직후 비어 있다. `size`·`color` 는 편집 폼 전용으로 남긴다. ⑤ 사진 서버 검사에 **픽셀 1600px·바이트 2MB** 추가 — 클라이언트가 1600px WebP 로 줄여 올리지만 API 를 직접 호출하면 우회되므로 서버가 다시 검사한다(화면 안내 문구는 5MB 유지 — 사용자에게 보이는 허용치는 입력 파일 기준이라 그대로여야 한다). ⑥ **대여 이력 화면 신설**(`/admin/history`) — 시트 스냅샷 216건을 검색·구분 필터·더 보기로 조회한다. 결과가 많으므로 50건씩 끊어 보여주고, 검색어 입력은 250ms 디바운스를 거친다(한 글자마다 API 를 부르지 않는다).

---

## 1. 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| 목적 | 청년지부 보유 물품(캠핑용품, 행사장비 등)의 대여 예약을 온라인으로 관리 |
| 이용자 | 지부 회원 (승인제) · 관리자 (운영진) |
| 물품 규모 | 97개 (대여품 93 · 소모품 4) — 카테고리 없음, 검색으로 탐색 (v2.5·v3.1) |
| 예상 동시 이용자 | 동시 접속 수 명 수준 (지부 단위 소규모) |
| 운영 비용 | 월 0원 (Cloudflare 무료 티어 기반) |
| 운영 환경 | Cloudflare 대시보드 (호스팅·저장소·도메인) + Neon 콘솔 (DB) — 2곳 |
| 유지보수 | 개발 1인, 웹 브라우저에서 모든 관리 가능 (앱/서버 설치 불필요) |

## 2. 사용자 및 권한

| 역할 | 권한 |
| --- | --- |
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

- **가용성 판정** (v2.11 일별 동시 점유 · v3.0 수량 기준): **대여 가능 수량 `rentable_qty = total_qty - qty_broken`** — 수리중 수량은 재고에서 뺀다. 신청 기간의 **매 대여일**마다 상태가 `pending/approved/picked_up`인 예약의 **`SUM(qty)` + 신청 수량 ≤ `rentable_qty`** 이면 신청 가능. 이전의 '구간과 겹치는 예약 건수' 기준은 수량 ≥ 2에서 인접 예약(붙어 있는 예약은 충돌 아님 — v2.10 ②)이 건수에 합쳐져 UI가 허용한 구간을 거짓 거부했고, `COUNT(*)` 기준은 재고를 나눠 담는 예약(10개 중 3개)에서 점유를 과소 계산했다. 반납일은 점유에서 제외(반개구간 `[start, end)`) — 신청 수량 자체가 `rentable_qty` 를 넘으면 겹치는 예약이 없어도 거부한다(v3.1 — 가드의 재고 검사는 `NOT EXISTS` 바깥에 있어야 한다, §8)
- **이중 예약 방지**: 물품별 advisory 락(`pg_advisory_xact_lock`)을 잡은 트랜잭션 안에서 가용 검사 INSERT를 실행 — `INSERT ... SELECT ... WHERE NOT EXISTS(일별 점유 초과)`. 단일 문장의 원자성(all-or-nothing)만으로는 두 동시 신청의 직렬화가 보장되지 않는다 (READ COMMITTED에서 각 문장은 문장 시작 스냅샷을 쓰고, HTTP 드라이버는 무상태라 요청마다 별도 세션 — 락 없이는 둘 다 통과). 더불어 `qty <= rentable_qty` 조건은 `NOT EXISTS` **바깥**에 둔다 — 안쪽 `HAVING` 은 겹치는 예약이 0건이면 평가될 행이 없어 통과하므로, 그 자리만으로는 재고 초과를 막지 못한다(v3.1)
- 승인 시점에 확정 예약만으로 이미 정원인 날이 있으면 관리자에게 경고 표시 — 신청 가드가 pending까지 일별 점유로 세므로 정상 흐름에선 0이고, 0이 아니면 이상 상태(동시성 레이스·`total_qty` 인하)다
- 반납일 하루 전·연체 알림은 **없다** (v3.0 — 이메일 발송 수단 제거). 연체는 관리자 목록·마이페이지의 **계산 배지**로만 드러난다 (`picked_up` + 반납일 경과)

## 4. 기능 명세

### 4.1 회원

- 최초 로그인 후 프로필 입력: 이름, 연락처(휴대폰)
- 마이페이지: 대여 중 / 승인 대기 / 대여 예정 / 대여 이력 목록, 신청 취소
- 회원 탈퇴: 소프트 삭제 (대여 이력 보존을 위해 비활성화 처리)

### 4.2 물품

- 목록: 검색 + 가용 배지 4종 — `available`(대여 가능) / `reserved`(예약 있음) / `rented`(대여 중) / `repair`(수리중 — 상태가 `repair` 이거나 `rentable_qty ≤ 0`). 카테고리 없음 — 검색(키워드+의미)으로 탐색 (v2.5)
  - 검색: 공백 구분 단어 전부 일치(AND) — **키워드 매치(이름·설명 ILIKE)를 먼저, 의미 매치(pgvector)를 그 뒤에 배치**
  - 의미 검색: Workers AI `@cf/baai/bge-m3`로 쿼리 임베딩 → 코사인 거리 상위 8개(거리 < 0.75) 물품을 키워드 매치에 없는 것만 추가. bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계(0.55)로 관련/무관 구분이 안 되므로 상대 랭킹으로만 사용 (실측). 임베딩은 물품 등록/수정 시 자동 생성(이름·설명), 실패 시 키워드 검색만 동작(폴백)
- 물품 속성 (v3.0): `kind`(대여품 `rental` / 소모품 `consumable`), `location`(보관 위치), `size`(사이즈·규격), `color`, `qty_broken`(수리중 수량), `note`(비고) — 실물 시트에서 들어온 값이라 대부분 비어 있을 수 있고 **전부 선택 항목**이다. 위치는 상세·편집 폼에만 표시하고 카드에는 띄우지 않는다(청년물품은 '정토회관' 단일 값이라 잡음)
- 상세: 사진(최대 3장), 설명, 보유 수량(`total_qty` 중 `qty_broken` 은 대여 불가), 대여 규칙(기본 대여일 수 등), 실시간 가용 일정
  - 수량 표시 (v3.1): 잔여 수량은 홈 카드(`대여 가능 3 / 7개` — 수량 ≥ 2 인 물품만), 상세(가용 일정 띠·캘린더), 마이페이지 예약 목록(`물품명 · N개`), 관리자 대시보드(수령·반납·연체 목록)와 관리자 예약 목록에 나온다. 신청 수량은 상세에서 **1 ~ 해당 기간 잔여 수량** 사이로 고르고, 기간을 바꾸면 1로 초기화한다(기간이 넓어지면 잔여 수량이 줄어들므로 유지하면 잘못된 수량이 남는다)
  - 사진은 업로드 전 브라우저에서 재인코딩(최장 변 1600px·WebP q80, 미지원 브라우저는 JPEG 폴백) — 원본 미보관, EXIF(위치정보) 제거, 파일당 통상 300KB 이하
- 관리자: 물품 등록/수정/삭제, 상태(정상/수리중/폐기) 관리, 수리중 수량 입력, 사진 업로드(R2 — API 엔드포인트가 Workers R2 바인딩으로 직접 저장)

### 4.3 대여

- 신청: 날짜 범위 + **수량(1 ~ 해당 기간 잔여 수량)** 선택 → 겹침 검사 → 신청 (메모 입력 가능) — 잔여 수량이 있으면 부분 대여(예: 10개 중 3개)가 가능하다 (v3.1)
- 관리자 처리: 신청 목록에서 승인/거절(거절 사유 필수), 수령 체크, 반납 체크 — 승인 시 수량을 **줄일 수 있고 늘릴 수는 없다**(늘리면 재고를 넘길 수 있어 400 `qty_increase_not_allowed`, v3.1). 확정 예약만으로 이미 정원인 날이 있는 신청은 목록에 `정원 초과 N일` 배지로 뜨고 승인 시 confirm 을 거친다(§3)
- 연체: 반납일 경과 시 목록에 `연체` 배지
- 대여 기간 정책 파라미터화: 기본 7일, 설정 테이블에서 변경 가능

### 4.4 관리자

- 대시보드: 오늘 수령/반납 예정, 승인 대기 건수, 연체 건수
- 회원 관리: 승인 대기 목록 → 승인/거절, 역할 지정/해제 (역할 변경은 총관리자만 — §2)
- 이력: `/admin/history` — 2025 청년페스타 시트 스냅샷(`rental_history` 216건)을 보는 조회 전용 화면. 물품명·신청자·소속을 한 검색어로 훑고(ILIKE `%q%` — 검색어의 `%`·`_` 는 와일드카드로 남겨 둔다, 저장소의 다른 검색과 같은 규칙) 청년/회관물품 구분 필터와 50건씩 '더 보기'를 제공한다. 상품 ID 가 연결된 건은 물품 상세로 가는 링크를 보여준다. 상태 전이·수정이 없는 참고 자료이고, 엑셀 다운로드는 2차 범위 (v3.1)

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
| --- | --- | --- | --- |
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
| GET | `/api/admin/history?q=&scope=&page=&limit=` | 과거 대여 이력 (시트 스냅샷, 참고용) | manager 이상 |

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
  source_key  TEXT,                            -- 실물 시트 행 키('Y26-*') — 일괄 반영의 멱등 키 (0008)
  kind        TEXT NOT NULL DEFAULT 'rental',  -- rental 대여품 | consumable 소모품 (v3.0)
  location    TEXT,                            -- 보관 위치 (v3.0)
  size        TEXT,                            -- 사이즈·규격 (v3.0)
  color       TEXT,                            -- 색상 (v3.0)
  qty_broken  INTEGER NOT NULL DEFAULT 0,      -- 수리중 수량 — rentable_qty 에서 차감 (v3.0)
  note        TEXT,                            -- 비고 (v3.0)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 대여 가능 수량 rentable_qty = total_qty - qty_broken (서버가 계산해 내려줌 — v3.0)
-- source_key 는 부분 유니크 — 수동 등록 물품(NULL)은 제약에서 제외한다 (0008)
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
  qty         INTEGER NOT NULL DEFAULT 1,       -- 예약 수량 (v3.0) — 가용 판정은 SUM(qty) 기준
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 가용성 판정(§3)과 이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_reservations_item_dates
  ON reservations (item_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_member
  ON reservations (member_id, status);

-- 2025 청년페스타 '물품대여' 시트의 과거 대여 이력 스냅샷 (0012, v3.0)
-- reservations 에 합치지 않는 이유: ① 청년/회관물품 구분이 자유 텍스트라 items FK 를 강제할 수 없고
-- (연결된 item_id 는 216건 중 10건뿐), ② 신청자가 members 에 없으며(source_key 로 재수입),
-- ③ 반납 여부·출고 상태 같은 옛 운영 컬럼을 예약 상태 머신에 끼워 넣으면 §3 이 오염된다.
-- 이력 '조회(참고)'용이며 가용성 판정(§3)에는 절대 관여하지 않는다.
-- 관리자 화면 /admin/history 가 검색·구분 필터·페이지네이션으로 읽는다 (v3.1).
CREATE TABLE IF NOT EXISTS rental_history (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_history_source
  ON rental_history (source_key);

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

INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo, qty)
SELECT $1, $2, $3, $4, $5, $6
-- 재고 자체보다 큰 수량은 겹치는 예약이 없어도 거부한다 (v3.1).
-- 이 조건을 NOT EXISTS 안쪽 HAVING 에만 두면, 겹치는 예약이 0건일 때 평가될 행이 없어
-- 통과해 버린다 — 사전 검사와 이 문장 사이에 관리자가 수량을 줄인 경쟁 조건이 정확히 그 경우다.
WHERE $6 <= (SELECT total_qty - qty_broken FROM items WHERE items.id = $1)
  AND NOT EXISTS (
  -- 요청 기간의 매 대여일마다 잔여 수량 확인 — 하루라도 넘치면 거절 (v3.0: SUM(qty) 기준)
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
-- NOT EXISTS 실패 (하루라도 전량 점유) 또는 재고 초과 → affected rows = 0 → 신청 거절 (API는 409 반환)
-- 락이 두 동시 신청을 직렬화한다 — 락 없이 단일 문장만으로는 READ COMMITTED 스냅샷 때문에
-- 둘 다 통과할 수 있다 (구 버전의 '단일 문장이니 원자적' 주장은 이 점에서 부정확했음)
```

**임베딩 백필**: `embedding` 은 물품 등록/수정 API 안에서만 생성된다. 실물 시트 일괄 반영처럼 **DB 에 직접 INSERT 하는 경로는 임베딩을 남기지 못하고**, 목록 쿼리가 `embedding IS NOT NULL` 인 행만 후보로 삼으므로 그 물품들은 의미 검색에서 조용히 빠진다(에러 없음 — 실측: 92건 중 70건 누락). 등록/수정 API 를 거치지 않는 일괄 입력 뒤에는 `npm run db:reembed` 를 실행한다(v3.0).

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
2. **보안**: OAuth 시크릿·R2 토큰은 Workers Secrets (`wrangler secret put`)로 관리. JWT는 서명 검증, HttpOnly 쿠키 저장, SPA JS 접근 차단. 관리자 API는 미들웨어에서 role 검사 (§8).
3. **번들 예산**: 초기 로드 gzip 150KB 이하 (Lit 코어 ~6KB 포함). 이미지는 R2에서 지연 로딩.
4. **반응형**: 모바일 우선 (대여 신청은 휴대폰에서 이루어질 것으로 가정). 하단 탭 네비 등 모바일 앱형 내비게이션.
5. **브라우저 지원**: 모던 브라우저 최신 2버전 (Chrome, Safari, Samsung Internet — Shadow DOM 기본 지원 범위).
6. **백업**: Neon 무료 플랜 PITR 창은 짧아(시간 단위) 유일한 수단으로 부적합 → **주 1회 GitHub Actions에서 `pg_dump` 실행**, 덤프를 비공개 아티팩트로 보관 (주요 백업 수단).
7. **가용성**: Workers는 일시정지 개념 없음. Neon 무료 플랜은 ~5분 유휴 후 컴퓨트 일시정지 → 재요청 시 수백 ms 콜드스타트 (지부 규모 체감 미미 — 인수). 저장 0.5GB·월 컴퓨트 시간도 필요량 대비 여유 — 대시보드에서 사용량 모니터링.
8. **백업 검증**: 분기 1회 덤프 복원 테스트로 백업 유효성 확인.

## 10. 무료 티어 한계 검증 (2026-09 기준, 공식 문서 확인)

| 서비스 | 무료 한도 | 본 서비스 필요량 | 판정 |
| --- | --- | --- | --- |
| Workers Free | 요청 100,000/일, CPU 10ms/요청 | 지부 규모 일 수백 요청 | ✅ 여유 |
| Neon Free | 저장 0.5GB · 월 컴퓨트 ~190시간 · 5분 유휴 일시정지 | 데이터 수십 KB, 간헐적 접속 | ✅ 여유 (유휴 콜드스타트 인수) |
| Neon Free | PITR 창 짧음 (시간 단위) | 주간 pg_dump로 보완 | ⚠️ 보완 필요 |
| R2 Free | 저장 10GB · Class A 100만/월 · Class B 1,000만/월 · 이그레스 무료 | 사진 50개 물품 × 3장 ≈ 수백 MB | ✅ 여유 |
| Cron Triggers | 무료 플랜 포함 (계정당 3개) | 미사용 | ✅ |
| Resend Free | 100통/일, 3,000통/월 | 미사용 (이메일 알림 v3.0 제거) | ➖ |

**총 운영 비용: 월 0원** (커스텀 도메인 사용 시 연 약 2만원 선택 · Cloudflare 무료 플랜은 비영리 제한 없음)

## 11. 개발 마일스톤

| 단계 | 내용 | 기간 |
| --- | --- | --- |
| 1 | Cloudflare 셋업(R2 생성) + Neon 프로젝트 생성(가까운 아시아 리전), 구글 OAuth 앱 등록, Vite+Lit 스캐폴드, Hono API 골격, Auth.js 로그인 + `/api/me`, 회원 승인 플로우 | 1주차 |
| 2 | 물품 관리 API + R2 사진 업로드, 물품 목록/상세 Lit 컴포넌트 (availability-strip 포함) | 2주차 |
| 3 | 대여 신청 (date-range-picker + 원자적 INSERT), 승인/수령/반납 관리자 화면 | 3주차 |
| 4 | 마이페이지, 관리자 대시보드, 개인정보 처리방침 | 4주차 |
| 5 | GitHub Actions 배포 자동화, **실물 데이터 입력 (v3.1 완료 — 물품 97건·과거 대여 이력 216건)**, 회원 테스트, 오픈 | 5주차 |

## 12. 향후 확장 (v2 후보)

- QR 코드로 수령/반납 처리 (관리자 스마트폰)
- 물품별 대여 통계 대시보드
- 연체·반납 예고 알림 (이메일 대신 카카오톡 알림톡 등 — v3.0 에서 이메일 알림을 뺀 뒤 재검토)
- 물품 예약 캘린더 뷰 (월간 그리드 — §7.6)
- Cloudflare Access로 운영진 관리자 페이지 이중 보호
- 중고 거래 게시판 등 지부 커뮤니티 기능
- PWA (오프라인 캐시, 홈 화면 추가)

---

*본 사양서 승인 후 개발 착수. 변경 사항은 이 문서에 버전을 올려 기록.*
