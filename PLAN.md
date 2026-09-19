# 작업 계획 — 현황 화면 개편 + 회원 승인(approved) 제거

프로젝트: `/Users/choidaruhan/Code/jts/item-rental` (Vite + Lit 3 + Hono + Cloudflare Workers + Neon Postgres, Deno task runner)

승인된 두 작업:
- **A.** `/admin`을 "물품 현황" 화면으로 개편 (물품별 현재 상태, 전체 물품=폐기 포함, 상태별 그룹)
- **B.** 회원 승인(approved) 완전 제거 → members.status = `{active, inactive}`, 기본 `'active'`

---

## 메모리 규칙 (사용자 설정, 우선)

- 커밋/푸시는 사용자가 직접 수행 — Claude는 git commit/push 실행 금지
- 작업 보고에 커밋 메시지 섹션 달지 말 것 (Co-Authored-By 등 attribution 줄도 넣지 말 것)
- 배포 후 프로덕션에서 바로 테스트 (로컬/프로덕션은 같은 Neon DB 공유)
- Bash가 분류기 차단으로 막히면 `! <명령어>` prefix로 사용자에게 넘길 것
- 로고/파비콘은 별 모양 확정 — 교체 제안 금지

---

## 결정 사항 (사용자 확정)

- **A:** "대시보드 말고 현황 화면으로 만들자, 현재 현황을 직관적으로" / 구성=물품별 현재 상태 / 범위=전체 물품(폐기 포함). 예약 수 카드·예약 처리 목록 아님.
- **B (사용자 어록):** "회원은 그냥 로그인 되면 다 회원인거야 승인 필요가 없고 이미 승인된거지 로그인 된다는 것 자체가 왜냐하면 @jungto.org 이메일만 로그인이 되니까" → 로그인 게이트가 곧 회원 심사. status = {active, inactive}.

---

## 중요 발견 (확인 완료)

- 마이그레이션 디렉토리는 server/에 없음. **루트 `/Users/choidaruhan/Code/jts/item-rental/migrations/*.sql`** (확장자 `.sql`!). 마지막: `0016_drop_item_attrs.sql`. migrate.ts는 `new URL('../../migrations/', import.meta.url)` glob, 모든 파일을 매 실행, IF NOT EXISTS/자연 멱등.
- members.status에는 CHECK 제약 없음 → ALTER 불필요.
- getSessionUser는 쿼리 레벨에서 `status <> 'inactive'` 제외 (inactive=세션 없음) — 변경 금지.
- server/tests/reservations.service_test.ts (단일 파일)의 pending/approved 언급은 예약 status('rented')에 관한 것 → **테스트 수정 불필요.**
- 어떤 파일을 편집하든 그 전에 반드시 해당 파일을 다시 Read 해야 함 (편집 툴 요구사항).

---

## 작업 순서

### 1) A-서버: server/src/services/dashboard.service.ts 전면 재작성

쿼리 2개 + JS 병합 (`Map<item_id, DashboardRenter[]>`). return `{ items }`.

**Q1** — 전체 물품(폐기 포함, search.service.ts buildListSql 패턴에서 retired 필터 제거):
```sql
SELECT items.id, items.name, items.kind, items.status, items.total_qty, items.qty_broken,
       (items.total_qty - items.qty_broken) AS rentable_qty,
       (SELECT '/api/photos/' || p.r2_key FROM item_photos p
         WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS photo,
       (SELECT COALESCE(SUM(r.qty), 0)::int FROM reservations r
         WHERE r.item_id = items.id AND r.status = 'rented') AS active_now
FROM items ORDER BY items.id DESC
```

**Q2** — 현재 대여자:
```sql
SELECT r.item_id, m.name AS member_name, m.phone AS member_phone, r.qty
FROM reservations r JOIN members m ON m.id = r.member_id
WHERE r.status = 'rented' ORDER BY r.item_id, r.created_at, r.id
```

- 기존 RENTED_LIMIT, counts 쿼리, 대여 목록 쿼리, Row 타입 제거.
- 실행: neon HTTP 드라이버 = 쿼리당 HTTP 1회 → `Promise.all` 병렬 (dashboard.service 기존 패턴). SAFETY 캐스트 `as unknown as` 패턴 유지.
- `server/src/routes/admin/dashboard.ts`는 변경 없음.

### 2) A-타입: web/src/types.ts

- `Dashboard`/`DashboardRow` 삭제 (약 68-88행)
- 추가:
  ```ts
  DashboardRenter { member_name, member_phone, qty }
  DashboardItem { id, name, kind, status, total_qty, qty_broken, rentable_qty,
                  active_now, photo: string | null, current_renters: DashboardRenter[] }
  Dashboard { items: DashboardItem[] }
  ```

### 3) A-화면: web/src/pages/admin/dashboard.ts 전면 재작성

- admin-nav `active="dashboard"` (라벨 "대시보드" 유지), h1 **"물품 현황"** (1.375rem)
- 요약줄: `전체 N개 · 대여 중 M · 점검·수리 K · 소모품 L · 폐기 R` (가져온 items로 그룹별 카운트)
- 그룹 순서: **대여 중 → 점검·수리 중 → 대여 가능 → 소모품 → 폐기**. 빈 섹션은 렌더 안 함. `g.total === 0` → "등록된 물품이 없어요"
- 그룹 판정 (item-card.ts:110-129와 일치):
  1. 폐기: `status === "retired"`
  2. 소모품: `kind === "consumable"` (비폐기)
  3. 점검·수리: `status === "repair" || qty_broken >= total_qty`  (qty_broken > 0 아님!)
  4. 대여 중: `active_now > 0`
  5. else: 대여 가능
- 정렬: 대여 중 그룹은 `active_now` desc, 나머지는 `name` asc (`localeCompare("ko")`)
- 행: 44px 썸네일(📦 폴백 + img `@err` 핸들러, item-card.ts:134-141 패턴) + 이름 + 소모품이면 badge; 수량 줄 (`총 ${total_qty} · 대여 중 ${active_now} · 수리 ${qty_broken}`); 대여자 줄 (`member_name ?? "회원"`, qty>1이면 `· ${qty}개`, phone, `", "` join)
- 썸네일+이름을 `<a href="/items/${id}">`로
- 스타일: `reduceMotion` + tokens만. `@state data/error` + connectedCallback fetch 패턴 유지

### 4) B-마이그레이션: 루트 migrations/0017_drop_member_approval.sql (신규, 확장자 .sql!)

```sql
UPDATE members SET status = 'active' WHERE status IN ('pending', 'approved');
ALTER TABLE members ALTER COLUMN status SET DEFAULT 'active';
```

자연 멱등. members.status에는 CHECK 제약이 없어 ALTER 불필요.

### 5) B-타입: status 2단계

- `server/src/types.ts:27` MemberStatus → `"active" | "inactive"`
- `web/src/types.ts:30` MemberStatus → `"active" | "inactive"`
- `web/src/context/session.ts:10` SessionUser.status → `"active" | "inactive"`
- `web/src/components/ui/badge.ts` LABELS에 `active: "활성"` 추가 (inactive "비활성" 이미 있음)

### 6) B-서버: 승인 로직 제거

- `server/src/auth.ts:35` 주석 "승인 대기 상태로 시작" → 로그인=가입 문구로 재작성 (INSERT 로직 변경 없음 — 스키마 디폴트 적용)
- `server/src/middleware/auth.ts`: `requireApproved`(:60-70) 삭제, 헤더 주석(:6-8) 갱신. `getSessionUser`/`requireAuth`/`requireAdmin` 유지
- `server/src/routes/reservations.ts`: :14 "(approved 회원 전용)" 주석 갱신, :22 `reservationsRoute.use("*", requireApproved)` 제거 (+:4 import 제거)
- `server/src/services/members.service.ts`:
  - `approveMember`(:19-28), `rejectMember`(:31-40), `PendingActionResult`(:16) 삭제
  - `listMembers` ORDER BY `(status = 'pending') DESC, created_at DESC`(:11) → `created_at DESC`
  - `deactivateMember` 마지막 관리자 가드(:64) `status = 'approved'` → `status = 'active'`
  - `setMemberRole`(:98-101) `if (role !== "user" && target.status !== "approved") return { error: "member_not_approved" }` + 그 주석 삭제. 마지막 관리자 가드(상태 필터 없음) 유지
- `server/src/routes/admin/members.ts`: `POST /:id/approve`(:27-32), `POST /:id/reject`(:35-40) + import 삭제. `PUT /:id/role`(:53-71)에서 `member_not_approved`→409 분기(:63-66) 제거 (bad_role + last_admin만). `use("*", requireAdmin)` 유지. 헤더 주석(:13-14) 승인 언급 제거

### 7) B-웹: UI/문구 정리

- `web/src/pages/admin/members.ts`:
  - `approve()`(:111-123), `reject()`(:125-138) 삭제
  - `renderCard`(:228-286): `acts` pending 블록(:229-247) 제거, 역할 select 조건 `m.status === "approved"`(:253-266) → `m.status !== "inactive"` (active=select, inactive=텍스트 배지), `<x-badge kind=${m.status}>`(:269) 유지, 비활성화 버튼(:271-280) `=== "approved"` → `=== "active"`
  - `setRole`(:196-198) `member_not_approved` 분기·메시지 삭제
  - 헤더 주석(:9-10) 승인 개념 없이 재작성
- `web/src/pages/mypage.ts`:
  - `bannerCard` pending 분기(:202-207) 삭제
  - 우선순위 주석(:61, :192) "비활성화 > 승인 대기 > 연락처 등록" → "비활성화 > 연락처 등록"
  - :281 `<x-badge kind=${this.user.status}>` — inactive일 때만 렌더 (active면 숨김 — danger 배너가 이미 안내)
- `web/src/components/features/item/item-rental-form.ts`: :312-318 pending 게이트 삭제. `phone_required` 분기(:250-251) 유지
- `web/src/pages/my-rentals.ts:178` `if (user?.status === "approved")` → `if (user)`
- `web/src/pages/login.ts:114-118` "관리자 승인 후" 문구 제거
- `web/src/pages/policy.ts`:
  - 개인정보 :87 "신청·승인·수령·반납 기록" → 승인 제거, :93 "물품 대여 승인·수령·반납 과정의 연락" → 신청·수령·반납
  - 약관 §2 "회원 가입 및 승인"(:177-187) → "회원 가입": "승인 대기 상태로 가입" → "로그인하면 바로 회원으로 가입돼요", :182 "관리자 승인 후 … 대여"·:185 "운영진은 승인을 거절할 수 있어요" 제거/개작
  - :191 "신청 → 관리자 승인 → 수령 → 반납" → "신청 → 수령 → 반납"
  - :211 "신청을 공정하게 승인·거절하고" 개작

### 8) 검증

1. `deno task check` (tsc --noEmit -p web && tsc --noEmit -p server)
2. `rg 'pending|approved' server web/src` — 잔여 소거 확인 (reservations 서비스의 'rented'/반납 관련 언급은 예약 status라 무관)
3. `deno task db:migrate` → `deno task dev` 로컬 확인 (로컬/프로덕션 같은 Neon DB)
4. 현재 시드에 예약/사진/소모품/폐기 데이터 없음 → dev & prod에서 핸드 생성 후 확인:
   - 현황 화면: 대여 중/점검·수리/대여 가능/소모품/폐기 그룹 분리, 썸네일·대여자·수량 표기
   - 승인 제거: 로그인 멤버가 승인 배너 없이 바로 대여 가능·내 대여 내역 로드. POST /api/auth 계정 pending 없이 즉시 active. /admin/members에 승인/거절 버튼 없음, active 멤버는 역할 select, inactive는 배지. /admin에서 역할 지정 가능(승인 대기 오류 없음)
5. `deno task deploy` 후 프로덕션에서 동일 수동 테스트
6. 보고 시 커밋 메시지 섹션 없이, git commit/push 없이 (사용자 직접 수행)