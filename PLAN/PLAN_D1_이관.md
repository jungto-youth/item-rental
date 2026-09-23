# D1 이관 계획 — Neon(Postgres) → Cloudflare D1(SQLite)

> 상태: 진행 중 — Phase 0~5 완료 (2026-09-23) · 작성: 2026-09 · 예상 공수: 2.5~3일
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
※ 실제 전환은 `server/src` 전체(스크립트 제외) — scripts는 §8에서 어댑터와 함께 전환 (Neon 병행 유지 필요)

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

- [x] `items.service.ts`: `json_agg` 3종 + `createItem` 동적 INSERT/UPDATE(`$${i+1}` 생성부 → `?${i+1}`) + FTS5 동기화 호출 추가 (§7) ✅ (완료 — 등록/수정은 `DELETE+INSERT` batch, 삭제는 `DELETE items RETURNING` + `DELETE items_fts` 동일 batch. `items.*` 대신 명시 컬럼으로 응답에서 `embedding` BLOB 제외 — ArrayBuffer 직렬화 깨짐 방지, web 미사용 확인)
- [x] `members.service.ts`, `routes/me.ts`, `auth.ts`, `middleware/auth.ts`: `now()`/placeholder 치환 ✅
- [x] `dashboard.service.ts`, `routes/admin/*`: 치환 + `::int` 제거 ✅ (routes/admin/* 는 SQL 위임 구조라 무변경 — 실제 치환은 services 6종과 embedding.ts)
- [x] 각 파일 수정 직후 `npx tsc --noEmit -p server/tsconfig.json` 유지 ✅

**Phase 3 구현 노트 (§6 규칙표 확정 사항)**
- **scripts 4종은 Phase 3에서 제외 → §8(Phase 5)로 연기**: seed/import/backfill/migrate 는 Neon 전용 도구라 지금 `?N`으로 바꾸면 Neon 대상 실행이 파손된다. §8의 어댑터 전환과 함께 처리
- **json 집계는 TEXT 반환**: D1은 `json_group_array`를 TEXT로 돌려준다(Postgres 드라이버는 json 타입을 파싱). `parseJsonCol` 헬퍼로 services에서 `JSON.parse` — API 응답 형태 무변경
- **정렬 서브쿼리 패턴 실측 통과**: 상관 참조(`items.id`)를 FROM 파생 테이블 안에서 쓰는 `json_group_array`/`group_concat` 모두 D1에서 정상. **파생 테이블 별명(`) c`) 누락 시 `no such column` — 별명 필수** (스모크에서 발견·수정한 실제 버그)
- **의미검색 선행 전환(§7.1/7.2)**: 규칙표대로 `embedding <=> $1::vector` → JS 코사인. `embed()`가 Float32Array 반환, `vecToBlob`/`blobToVec`(명시 little-endian), isolate 벡터 캐시(`getVectorCache`/`cacheVec`/`uncacheVec`)를 embedding.ts에 배치 — import 순환 없음. 임계는 기존 distance<0.8 동등인 sim≥0.2, 상위 30 유지(Phase 4에서 §7.4 값으로 조정)
- **`id IN (SELECT value FROM json_each(?1))`** — `ANY(string_to_array)` 대체, `JSON.stringify(ids)` 바인딩
- **`LIKE ... ESCAPE '\'`**: SQLite LIKE는 기본 이스케이프 문자가 없어 문장마다 명시 — '100%' 회귀(684976e) 보존 확인
- **`returned_by_member` boolean 매핑**: SQLite는 boolean 식이 0/1 — `listReservations`에서 JS로 `!== 0` 변환해 API 계약(true/false) 유지. UNIQUE 중복 판별도 `code==='23505'` → 메시지 매치로 전환
- **로컬 스모크 실측 (wrangler dev + 로컬 D1)**: 탐색/검색(랭킹·부분매치·와일드카드 이스케이프)/상세/카테고리, 프로필 수정, 대여 신청 201·**재고 초과 409(batch 가드)**·본인 반납, 관리자 CRUD 왕복(등록→검색→수정→삭제, FTS 고아 없음), allowed_emails 201/409, 역할 변경·**last_admin 409**·탈퇴 — 전부 통과. 의미검색·임베딩은 로컬에선 AI 바인딩 불가 → 폴백(키워드만) 동작 확인, 배포 환경에서 정상
- 타임스탬프 실측: `2026-09-23T11:05:04.786Z` — Postgres JSON 출력과 동일

## 7. Phase 4 — 검색 재작성 `search.service.ts` + `embedding.ts` (1일)

### 7.1 `embedding.ts` ✅ (완료 — Phase 3에서 선행, §6 규칙표 `embedding <=> $1::vector → JS 코사인` 적용분)

- [x] `embed(env, text): Promise<Float32Array>` — `'[...]'` 문자열 반환을 Float32Array로 변경
- [x] `vecToBlob(v: Float32Array): Uint8Array` / `blobToVec(b): Vec` (DataView 명시 little-endian, 노름 선계산)
- [x] `embedItem`: `UPDATE items SET embedding = ?1` (BLOB 파라미터) + isolate 벡터 캐시 갱신
- [x] `string_agg` → `group_concat` (서브쿼리 정렬) — **파생 테이블 별명(`) c`) 필수, 누락 시 `no such column`** (Phase 3 스모크에서 발견·수정)

### 7.2 벡터 캐시 (`embedding.ts`에 배치 — search.service와의 import 순환 회피) ✅ (완료)

- [x] `Map<number, { v: Float32Array; norm: number }>` — 최초 의미검색 시 `SELECT id, embedding FROM items WHERE embedding IS NOT NULL` 일괄 로드
- [x] 갱신: `embedItem` 성공 시 `cacheVec` 교체, `deleteItem` 성공 시 `uncacheVec` 제거. 기존 `QUERY_VEC_CACHE`(쿼리 임베딩) 무변경

### 7.3 FTS5 동기화 지점 (contentful 테이블, `rowid = items.id`) ✅ (완료 — Phase 3)

- [x] `createItem`: INSERT + 카테고리 교체 후 `syncItemFts` — `DELETE+INSERT INTO items_fts` batch (FTS5는 UPSERT 미지원)
- [x] `updateItem`: 컬럼 변경 또는 카테고리 변경 시 `syncItemFts` (행을 재조회해 name/description/location/tags 재구성)
- [x] `deleteItem`: `DELETE items RETURNING` + `DELETE items_fts WHERE rowid = ?` 같은 batch — 고아 방지
- [ ] `import-items.ts`: FTS 삽입 포함 → **§8 (Phase 5) scripts 전환과 함께**

### 7.4 검색 흐름 (`searchHybrid` 재작성) ✅ (완료)

```
tokens = q.trim().split(/\s+/).slice(0, 5)
1) FTS5:  MATCH '"토큰1" AND "토큰2" …'  (토큰을 큰따옴표로 감싸 FTS5 구문 주입 차단, " → "")   ✅ ftsQuery + 단위 테스트
          ORDER BY bm25(items_fts), rowid DESC LIMIT 50 → id 랭킹 리스트                          ✅ searchFtsRanked
          ※ 1-2글자 토큰은 trigram 매치 불가 → 해당 토큰만 기존 escapeLike + LIKE 폴백            ✅ splitKeywordTokens + searchLikeRankedIds
2) 벡터:  쿼리 임베딩(캐시) × isolate 벡터 전수 코사인, similarity ≥ 0.25 상위 8                  ✅ semanticRankIds
3) RRF:   score(id) = Σ 1/(60 + rank)  — bm25·LIKE·코사인 3리스트 융합                            ✅ fuseRRF(number[][], k=60)
4) 목록:  buildListSql WHERE items.id IN (SELECT value FROM json_each(?1)) — 목록 컬럼 그대로     ✅
5) 의미검색 실패(Workers AI 오류) 시: 키워드 결과만 — 기존 폴백 동작 유지                          ✅ semanticRankIds가 [] 반환
```

- [x] 삭제되는 코드: ILIKE 가중치 점수식, `searchKeywordRanked`의 행 랭킹, `string_to_array/ANY` 우회 (Phase 3에서 이미 제거)
- [x] 통계 쿼리: `SUM(CASE WHEN …)`로 (Phase 3에서 완료)
- **구현 노트**: FTS 행은 상태를 모르므로 폐기 물품은 최종 목록 SQL(`status <> 'retired'`)에서 걸러진다. bm25 동률 tiebreak는 `rowid DESC` (최근 등록 우선 관례). 로컬 스모크: FTS 경로(점프로프), LIKE 경로(요가·매트 운동), FTS AND 두 토큰, '100%' 와일드카드 차단 — 전부 실측 통과. 의미 축은 배포 환경에서만 검증 가능(로컬 AI 바인딩 불가 — 폴백 동작은 확인)

### 7.5 SPEC 반영 ✅ (완료)

- [x] `SPEC.md` §4.2: "키워드(ILIKE) → 의미 순 배치" → "3개 랭킹(FTS5 bm25 / LIKE 폴백 / BLOB 코사인) RRF 융합", 1-2글자 폴백 명시. 스키마 표시도 D1 기준으로 갱신(embedding BLOB, strftime 기본값)
- [x] README 기술 스택 표: DB 행 → `Cloudflare D1 (SQLite)`, 검색 행 갱신 + 검색 절·디렉터리 안내(db.ts 어댑터, migrations-d1) 갱신

## 8. Phase 5 — 스크립트 이관 (반나절) ✅ (완료 2026-09-23)

| 스크립트 | 처리 |
|---|---|
| `scripts/migrate.ts` | ✅ **삭제** — `wrangler d1 migrations apply item-rental-db`로 대체, `db:migrate` 태스크 제거 |
| `scripts/seed.ts`, `import-items.ts` | ✅ **SQL 생성 모드로 통일** (§8 원안의 "로컬은 wrangler dev 바인딩" 대신): 워커 밖에서 D1 바인딩을 쓰려면 `getPlatformProxy` 같은 별도 런타임이 필요하지만, `wrangler d1 execute --local/--remote --file=` 한 경로로 통일하면 §9 적용 절차와 같은 도구가 되고 의존성도 줄어든다. 둘 다 `NOT EXISTS` 멱등 가드 INSERT + `items_fts` 삽입(가드가 중복·고아를 막는다) 포함, `--update`는 UPDATE+FTS DELETE+INSERT. 적용 대상 파일을 `server/scripts/out/`에 생성하고 wrangler 명령을 안내 |
| `scripts/backfill-remove-item-attrs.ts` | ✅ 보존만, 헤더에 "실행 대상 아님" 표시 (Neon 방언 레거시) |
| `scripts/reembed.ts` | ✅ **삭제** → `POST /api/admin/reembed-all` (routes/admin/reembed.ts, admin 가드). 무료 플랜 요청당 서브리퀘스트 50 한계 때문에 커서 방식 15건/요청 — `{processed, next_after}` 반환, `next_after`가 null이면 끝. 임베딩 실패는 삼켜지므로(기존 embedItem 계약) 기본 모드 재호출로 재시도된다 |
| 신규 `scripts/export-neon-to-d1.ts` | ✅ §9 데이터 펌프 — pgvector 텍스트 → f32 LE `X'hex'` BLOB 리터럴(1024차원 검증), timestamptz(Date 객체) → ISO 문자열, `items_fts`를 태그 재구성해 함께 생성. 선두에 FK 역순 DELETE(재적용 멱등 — **새 D1 DB에만 적용** 주의문), 콘솔에 행수 요약(§9.3 대사 기준) 출력 |

**스모크**: `db:seed` 생성 → 로컬 적용(물품 15종 추가, FTS 15행) → 재적용 멱등 확인 → '코펠'(FTS)/'텐트'(LIKE) 검색 히트. reembed 엔드포인트 401 가드, 배치 15건 `next_after=15` → 이어서 2건 `next_after=null` 종료 — 실측 통과

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
