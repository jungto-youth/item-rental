# D1 이관 계획 — Neon(Postgres) → Cloudflare D1(SQLite)

> 상태: 진행 중 — Phase 0~2 완료 (2026-09-23) · 작성: 2026-09 · 예상 공수: 2.5~3일
> 목표: 검색 계층을 D1 FTS5(trigram) + 벡터 BLOB + RRF 융합으로 재작성하며 DB를 Neon에서 D1으로 옮긴다
> 관련 문서: [SPEC.md](SPEC.md) §4.2, [README.md](README.md) 기술 스택 표

## 0. 목표 · 비목표

**목표**
- Cloudflare 생태계 안으로 통합: D1 바인딩 호출로 Neon HTTP 왕복(수십 ms) 제거, `DATABASE_URL` 시크릿 제거
- 검색 품질 상향: ILIKE 가중치 점수 → FTS5 `bm25()` + 코사인 → **RRF 융합**
- 월 0원 유지 (D1 무료 티어: 저장소 5GB / 읽기 500만 행·일 / 쓰기 10만 행·일 — 이 앱 규모에 충분)

**비목표 (하지 않는 것)**
- Vectorize 도입 — 물품 수만 개 이상이 될 때까지 벡터는 BLOB + Worker 내 계산 (Phase 6 참고)
- 프론트엔드(web/) 변경 — API 응답 형태를 그대로 유지
- 스키마 재설계 — 최종 형태 그대로 1:1 이관 (이 기회에 컬럼 추가/정리하지 않는다)

## 1. 조사 결과 — 영향면 (2026-09 기준)

| 항목 | 수량/위치 |
|---|---|
| `$N` 플레이스홀더 | 53곳, 파일 14개 (`server/src` 10 + `server/scripts` 4) |
| `db.query()` 보편 API | 전 호출부 — `Sql` 타입 어댑터로 시그니처 유지 가능 (§3) |
| neon `.transaction([...])` | `reservations.service.ts:87-121` — 1곳만 (§5.2) |
| `json_agg(json_build_object(...))` | `search.service.ts:19`, `items.service.ts` 다수 → `json_group_array(json_object(...))` |
| `string_agg(... ORDER BY ...)` | `embedding.ts:29` → 서브쿼리 정렬 + `group_concat` |
| `ILIKE` + 가중치 점수 | `search.service.ts:78-100` → FTS5 `bm25()`로 대체 (코드 삭제) |
| `now()` | `members.service.ts:42`, `reservations.service.ts:185,204,272` → `strftime('%Y-%m-%dT%H:%M:%fZ','now')` 헬퍼 |
| `$1::vector` | `embedding.ts:38` → BLOB 파라미터 |
| `COUNT(*) FILTER (WHERE …)` | `search.service.ts:62-63` → `SUM(CASE WHEN …)` (이식성 확실 쪽 선택) |
| `RETURNING` / `ON CONFLICT DO NOTHING` | SQLite도 지원 — 그대로 유지 |
| `GEN_RANDOM_UUID()` | `migrations/0001` members PK → 기준선에서 `lower(hex(randomblob(16)))` |
| `GENERATED ALWAYS AS IDENTITY` | → `INTEGER PRIMARY KEY` (rowid 별칭) |

## 2. 목표 아키텍처

```
[Workers Hono]
  ├─ getDb(env) → D1 어댑터 (기존 Sql 인터페이스 유지: query/batch)
  │    ├─ 일반 CRUD/조회 — D1 prepare().bind()
  │    ├─ 키워드 검색 — items_fts (FTS5, trigram, contentful) MATCH + bm25()
  │    └─ 대여 신청 — d1.batch([INSERT…SELECT…guard RETURNING])  ← advisory lock 대체
  ├─ 의미 검색 — items.embedding BLOB(1024×f32) → isolate 캐시 → JS 코사인 top-8
  ├─ 융합 — RRF(k=60) bm25 랭킹 × 코사인 랭킹 → 최종 목록 SQL + 가용 배지(무변경)
  ├─ 임베딩 생성 — Workers AI @cf/baai/bge-m3 (무변경, 기존 벡터 재사용)
  └─ 사진 — R2 (무변경)
```

**핵심 설계 결정**

1. **`Sql` 어댑터로 호출부 최소 변경** — `db.query(sql, params)` 시그니처를 어댑터가 그대로 흉내내므로, 라우트/서비스는 SQL 문자열만 고친다. `.transaction([...])`은 `.batch([...])`로 대체 (D1 batch는 하나의 트랜잭션으로 원자 실행).
2. **FTS5는 contentful 일반 테이블** — external content + 트리거 대신 앱에서 동기화. 물품 텍스트는 작아서 복제 비용 무의미. `rowid = items.id`로 저장해 조인 없이 바로 매핑.
3. **벡터는 BLOB + isolate 캐시** — D1은 sqlite-vec 확장 불가(공식 확인). 수백 개 물품이면 전체 벡터(≈400KB)를 isolate에 올려 JS 코사인 — 새 인프라 0.
4. **임베딩 모델 무변경** — bge-m3 그대로라 **기존 pgvector 벡터를 그대로 이관** (재임베딩 불필요).
5. **SQLite 단일 라이터 = advisory lock 불필요** — `SET LOCAL` + `pg_advisory_xact_lock` 패턴은 batch 원자성으로 동일 보장 달성.

## 3. Phase 0 — 준비 (반나절)

- [x] `migrations/0022_*` 번호 중복 정리: `0022_allowed_emails.sql` → `0023_allowed_emails.sql` (Neon 히스토리 정합 — 이미 적용돼 파일명만 변경)
- [x] `wrangler d1 create item-rental-db` → `database_id` 확보 (APAC, `4f220ed2-dd45-41dc-ba1e-075889a4589a`)
- [x] `wrangler.jsonc`에 `d1_databases: [{ binding: "DB", database_name: "item-rental-db", database_id, migrations_dir: "migrations-d1" }]` 추가 (Neon 제거는 Phase 6까지 보류)
- [x] **스모크 테스트**: D1에서 `RETURNING`, `json_object()/json_group_array()`, FTS5 trigram 생성, partial index 동작 확인 (쿼리 4개) — 전부 통과. 단, trigram 2글자 토큰 미매치 확인(예상대로) → §7.4 LIKE 폴백 필수

## 4. Phase 1 — 스키마 기준선 (반나절)

- [x] `migrations-d1/0001_baseline.sql` 작성 — 22개 마이그레이션을 재생하지 않고 **현재 최종 형태**를 새로 작성
  - 방언 전환: `GENERATED ALWAYS AS IDENTITY`→`INTEGER PRIMARY KEY`, `TIMESTAMPTZ DEFAULT now()`→`TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` (ISO 형태 유지 — JSON 응답 무변경, 적용 후 실측 확인), `vector(1024)`→`embedding BLOB`, `GEN_RANDOM_UUID()`→`lower(hex(randomblob(16)))`, CHECK 제약은 그대로
  - FTS5 테이블:
    ```sql
    CREATE VIRTUAL TABLE items_fts USING fts5(
      name, description, location, tags,
      tokenize = 'trigram'
    );
    -- rowid = items.id, 앱에서 동기화 (§6)
    ```
  - 인덱스: `idx_reservations_member`, `idx_reservations_item_status_qty`, `idx_item_categories_category`, `idx_items_source_key`(partial) 등 기존 것 전부 이식
- [x] `wrangler d1 migrations apply item-rental-db --local` 로컬 검증 (FK CASCADE·CHECK 제약·타임스탬프 기본값까지 확인)

## 5. Phase 2 — 어댑터 · 타입 · 트랜잭션 (반나절)

### 5.1 `server/src/db.ts` — 어댑터 ✅ (완료 — `SQL_NOW` 헬퍼 추가, batch는 D1 결과를 `T[][]`로 평탄화)

```ts
export type Sql = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  batch<T = Record<string, unknown>>(stmts: { sql: string; params?: unknown[] }[]): Promise<T[][]>;
};
export function getDb(env: Bindings): Sql { /* env.DB.prepare().bind().all() / env.DB.batch() */ }
```

- `$N` → `?N` 전환은 이 단계에서 파일별로 일괄 (§6 파일 목록)
- `RETURNING`은 D1에서 동작 — 호출부의 `rows[0].id` 패턴 무변경

### 5.2 `reservations.service.ts:87-121` — 대여 신청 경합 처리 (최고 주의) ✅ (완료)

- 현행: `transaction([SET LOCAL, pg_advisory_xact_lock, INSERT…SELECT…가드 RETURNING id])`
- 이관: `batch([{ INSERT INTO reservations … SELECT … WHERE 잔여수량 가드 RETURNING id }])`
- 결과 판정: batch 결과의 `results[0].length === 0` → 초과(409). advisory lock 삭제 근거를 코드 주석에 기록 (SQLite 단일 라이터 + batch 원자성)
- **구현 노트**: 이 파일 전체를 D1 방언으로 먼저 전환(§3 규칙표 적용). `busy`/`lock_timeout` 개념은 advisory 락 폐기에 따라 `ReservationResult`와 라우트 분기에서 함께 제거. 가드 INSERT의 런타임 동작(재고 내 성공 / 초과 0행)을 로컬 D1에서 실측 확인. 테스트 스텁을 D1 `{sql, params}` 형태로 재작성

### 5.3 `server/src/types.ts` ✅ (완료)

- `Bindings`: `DATABASE_URL: string` 제거 → `DB: D1Database` 추가 (나머지 무변경)

## 6. Phase 3 — 쿼리 전환 (1일)

**플레이스홀더 치환 파일 목록 (14개)**
`middleware/auth.ts`, `auth.ts`, `embedding.ts`, `routes/me.ts`, `routes/items.ts`, `routes/reservations.ts`, `routes/categories.ts`, `routes/admin/{items,reservations,members,categories,allowed-emails,dashboard}.ts` (routes 6), `services/{search,items,reservations,members,categories,allowed-emails,dashboard}.service.ts` (services 7), `scripts/{migrate,seed,import-items,backfill-remove-item-attrs}.ts`

**치환 규칙표**

| Postgres | SQLite (D1) |
|---|---|
| `$1, $2, …` | `?1, ?2, …` |
| `json_agg(json_build_object('k', v) ORDER BY x)` | `json_group_array(json_object('k', v) ... )` + 서브쿼리 `ORDER BY` (SQLite json_object 집계 내 ORDER BY 미지원 — 정렬용 서브쿼리로 감싸기) |
| `'[]'::json` | `'[]'` (TEXT 리터럴) |
| `COALESCE(SUM(x),0)::int` | `COALESCE(SUM(x),0)` (SQLite SUM은 이미 정수) |
| `string_agg(c.name,' ' ORDER BY c.name)` | `group_concat(c.name,' ')` — FROM 서브쿼리에서 `ORDER BY c.name` 선적용 |
| `now()` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `$1::text IS NULL` | `?1 IS NULL` |
| `COUNT(*) FILTER (WHERE p)` | `SUM(CASE WHEN p THEN 1 ELSE 0 END)` |
| `ILIKE` (검색 외 남는 곳) | `LIKE` (ASCII만 케이스 무시 — 한글 무영향) |
| `embedding <=> $1::vector` | JS 코사인 (§7) |

- [ ] `items.service.ts`: `json_agg` 3종 + `createItem` 동적 INSERT/UPDATE(`$${i+1}` 생성부 → `?${i+1}`) + FTS5 동기화 호출 추가 (§7)
- [ ] `members.service.ts`, `routes/me.ts`, `auth.ts`, `middleware/auth.ts`: `now()`/placeholder 치환
- [ ] `dashboard.service.ts`, `routes/admin/*`: 치환 + `::int` 제거
- [ ] 각 파일 수정 직후 `npx tsc --noEmit -p server/tsconfig.json` 유지

## 7. Phase 4 — 검색 재작성 `search.service.ts` + `embedding.ts` (1일)

### 7.1 `embedding.ts`

- `embed(env, text): Promise<Float32Array>` — `'[...]'` 문자열 반환을 Float32Array로 변경
- `vecToBlob(v: Float32Array): ArrayBuffer` / `blobToVec(b: ArrayBuffer): { v: Float32Array; norm: number }` (little-endian 고정)
- `embedItem`: `UPDATE items SET embedding = ?1` (BLOB 파라미터) + isolate 벡터 캐시 갱신
- `string_agg` → `group_concat` (서브쿼리 정렬)

### 7.2 벡터 캐시 (`search.service.ts` 또는 `embedding.ts`)

- `Map<number, { v: Float32Array; norm: number }>` — 최초 의미검색 시 `SELECT id, embedding FROM items WHERE embedding IS NOT NULL` 일괄 로드
- 갱신: `embedItem` 성공 시 해당 항목 교체, 삭제 시 제거. 기존 `QUERY_VEC_CACHE`(쿼리 임베딩) 무변경

### 7.3 FTS5 동기화 지점 (contentful 테이블, `rowid = items.id`)

- `createItem`: INSERT 직후 `INSERT INTO items_fts(rowid, name, description, location, tags) VALUES (?,?,?,?,?)` — tags는 카테고리 이름 공백 조인 (`embedItem`이 쓰는 것과 동일 텍스트 규칙)
- `updateItem`: name/description/location 변경 시 `UPDATE`, 카테고리 변경 시 tags 재계산 → 같은 batch로 원자 처리
- `deleteItem`: `DELETE FROM items_fts WHERE rowid = ?` 같은 batch
- `import-items.ts`: FTS 삽입 포함

### 7.4 검색 흐름 (`searchItemsCombined` 재작성)

```
tokens = q.trim().split(/\s+/).slice(0, 5)
1) FTS5:  MATCH '"토큰1" AND "토큰2" …'  (토큰을 큰따옴표로 감싸 FTS5 구문 주입 차단, " → "")
          ORDER BY bm25(items_fts) LIMIT 50 → id 랭킹 리스트
          ※ 1-2글자 토큰은 trigram 매치 불가 → 해당 토큰만 기존 escapeLike + LIKE 폴백
2) 벡터:  쿼리 임베딩(캐시) × isolate 벡터 전수 코사인, similarity ≥ 0.25 상위 8
          (기존 거리 < 0.75 동등 이동)
3) RRF:   score(id) = Σ 1/(60 + rank)  — bm25 리스트 + 코사인 리스트 융합
4) 목록:  buildListSql WHERE items.id IN (…) — 사진/태그/active_now/배지 기존 그대로
5) 의미검색 실패(Workers AI 오류) 시: 키워드 결과만 — 기존 폴백 동작 유지
```

- 삭제되는 코드: ILIKE 가중치 점수식(`search.service.ts:81-100`), `searchItems`의 OR-루프, `string_to_array/ANY` 우회
- 통계 쿼리(`:62-63`): `SUM(CASE WHEN …)`로

### 7.5 SPEC 반영

- `SPEC.md` §4.2: "키워드(ILIKE) → 의미 순 배치" → "FTS5 bm25 × pgvector→BLOB 코사인을 RRF 융합"으로 갱신, FTS5 폴백(1-2글자) 명시
- README 기술 스택 표: DB 행 `Neon (PostgreSQL 16)` → `Cloudflare D1 (SQLite)`, 검색 행 갱신

## 8. Phase 5 — 스크립트 이관 (반나절)

| 스크립트 | 처리 |
|---|---|
| `scripts/migrate.ts` | 은퇴 — `wrangler d1 migrations apply item-rental-db --remote`로 대체 |
| `scripts/seed.ts`, `import-items.ts` | getDb 어댑터 + D1: 로컬은 `wrangler dev` 바인딩, 리모트는 `wrangler d1 execute`용 SQL 생성 모드. import 시 FTS 삽입 포함 |
| `scripts/backfill-remove-item-attrs.ts` | 과거 마이그레이션 보조 — 보존만, 실행 대상 아님 표시 |
| `scripts/reembed.ts` | Workers AI는 워커 밖에서 호출 불가 → **관리자 임시 엔드포인트** `POST /api/admin/reembed-all` (admin 가드) 로 대체, 완료 후 유지(재사용 저렴) |
| 신규 `scripts/export-neon-to-d1.ts` | §9 데이터 펌프 |

## 9. Phase 6 — 데이터 이관 · 전환 · 검증 (반나절)

**절차 (새벽 등 쓰기 없는 시간대)**
1. `export-neon-to-d1.ts` 실행 → 테이블별 INSERT SQL 생성 (embedding은 `X'hex'` 리터럴, timestamptz는 그대로 문자열)
2. `wrangler d1 execute item-rental-db --remote --file=…` 적용 (FTS 테이블 INSERT 포함 — 덤프 스크립트가 fts 행도 생성)
3. 행수 대사: Neon vs D1 각 테이블 COUNT 일치
4. `wrangler dev`(로컬 D1 사본)에서 검증 체크리스트 통과
5. 배포 → 운영 검증 → `wrangler secret delete DATABASE_URL`, wrangler.jsonc에서 Neon 주석 제거

**검증 체크리스트**
- [ ] 검색 회귀: 사전 기록한 질의 세트(정확명/부분명/위치/카테고리/오타/1-2글자/의미성 예: "천 밖에서 치는 운동") 결과 비교 — 키워드는 동일+개선, 의미는 유사
- [ ] 가용 배지 4종 (available/rented/repair/소모품 null)
- [ ] 관리자 CRUD 왕복: 등록(사진 포함)→수정(태그 교체, 수량 제약 409)→삭제(R2 정리)
- [ ] 대여 흐름: 신청/취소/반납 + **재고 초과 동시 신청 409** (batch 가드)
- [ ] 로그인/프로필/멤버 관리, allowed_emails
- [ ] 물품 등록·수정 시 임베딩 생성 로그 확인

**롤백**: 검증 실패 시 `wrangler rollback`으로 이전 배포 복귀 — Neon은 Phase 6.5(안정화 1주)까지 유지 후 계정 정리. `DATABASE_URL` 시크릿도 1주 유지 후 삭제.

## 10. Phase 7 — 이후 (트리거 기반, 지금 하지 않음)

- 물품 ≥ 1만: 벡터만 Vectorize로 승격 (같은 bge-m3 벡터 업로드, `searchSemanticItems`만 교체)
- 물품 ≥ 수천: bm25 가중치(`bm25(items_fts, 3.0, 1.0, …)`)·RRF k·similarity 임계 튜닝, no-result 로그 축적

## 11. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| trigram 1-2글자 미매치 | LIKE 폴백 경로 (§7.4) — 기존 escapeLike 재사용 |
| FTS5 MATCH 구문 주입 (따옴표·NEAR 등) | 토큰 `"…"` 래핑 + 내부 `"` 이중화 |
| json 집계 ORDER BY 미지원 | 정렬 서브쿼리 패턴으로 통일 (§6 규칙표) |
| batch 결과 판정 실수 (대여 경합) | §5.2 전용 케이스 테스트 — 재고 초과 409 검증을 체크리스트에 고정 |
| 타임스탬프 형식 변화로 프론트 깨짐 | `strftime` ISO 유지 (§4) — JSON 응답 무변경 |
| D1 무료 티어 한도 | 읽기 500만 행/일 — 현재 트래픽에서 수백 배 여유 |

## 12. 일정 요약

| Phase | 내용 | 공수 |
|---|---|---|
| 0 | 준비·스모크 | 반나절 |
| 1 | 스키마 기준선 | 반나절 |
| 2 | 어댑터·타입·트랜잭션 | 반나절 |
| 3 | 쿼리 전환 (14파일 53곳) | 1일 |
| 4 | 검색 재작성 (FTS5+벡터+RRF) | 1일 |
| 5 | 스크립트 이관 | 반나절 |
| 6 | 데이터 이관·검증·스위치 | 반나절 |
| 합계 | | **2.5~3일** |
