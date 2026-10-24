// 검색·탐색 서비스 — "탐색"(전체 목록 무한스크롤)과 "검색"(랭킹된 짧은 리스트)을 분리한다.
// 검색 = FTS5 bm25 랭킹(3글자↑ 토큰) + LIKE 폴백 랭킹(1-2글자 토큰) + 의미(벡터 BLOB JS 코사인)
// 를 RRF로 융합해 상위 N개만 내린다.
// 검색에는 페이지네이션이 없다 — 퍼지 매치의 꼬리는 노이즈라 "2페이지"가 의미 없다.
import type { Sql } from "../db";
import type { Bindings } from "../types";
import type { AvailabilityBadge, CatalogSummary } from "../../../shared/api-types";
import type { ListItemRow } from "./items.service";
import { parseJsonCol } from "./items.service";
import { embed, getVectorCache } from "../embedding";
import { availabilityBadgeOf } from "../../../shared/stock";

// 배지까지 계산된 목록 행 — 화면(web/src/types.ts Item)과 같은 모양
export type ListItemWithBadge = ListItemRow & {
  availability_badge: AvailabilityBadge | null;
};

// 목록 SELECT 공용 — 전체 목록/키워드/의미가 같은 컬럼을 내려준다 (where 절만 다름)
// json 집계는 SQLite가 ORDER BY를 지원하지 않아 정렬용 서브쿼리로 감싼다.
// 위치는 locations 참조로 정규화됐지만(0005) API 계약은 이름 문자열이라 join 으로 푼다.
const LIST_COLUMNS = `SELECT items.id, items.name, items.description, items.total_qty, items.lifecycle,
            items.kind, l.name AS location,
            items.qty_repair,
            (items.total_qty - items.qty_repair) AS rentable_qty,
             (SELECT json_group_array(json_object('id', p.id, 'url', '/api/photos/' || p.r2_key || '?access=members'))
             FROM (SELECT p.id, p.r2_key FROM item_photos p
                    WHERE p.item_id = items.id ORDER BY p.sort_order) p) AS photos,
            (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented') AS active_now`;

// 행별 카테고리 — 관리자 요청에만 붙인다. 회원 응답은 오늘과 같은 모양(카테고리 제외) 유지
const CATEGORIES_COLUMN = `(SELECT json_group_array(json_object('id', c.id, 'name', c.name))
             FROM (SELECT c.id, c.name FROM item_categories ic
                    JOIN categories c ON c.id = ic.category_id
                    WHERE ic.item_id = items.id ORDER BY c.name) c) AS categories`;

function parseListRows(rows: ListItemRow[]): ListItemRow[] {
  for (const r of rows) {
    r.photos = parseJsonCol(r.photos);
    if (r.categories != null) r.categories = parseJsonCol(r.categories);
  }
  return rows;
}

function buildListSql(
  where: string,
  withCategories = false,
  includeRetired = false,
): string {
  const lifecycleFilter = includeRetired ? "" : "items.lifecycle <> 'retired' AND ";
  return `${LIST_COLUMNS}${withCategories ? `,\n            ${CATEGORIES_COLUMN}` : ""}
     FROM items
     LEFT JOIN locations l ON l.id = items.location_id
     WHERE ${lifecycleFilter}1=1 ${where}
     ORDER BY items.id DESC`;
}

// 관리자 카테고리 필터 — "none" 은 미지정, 숫자는 카테고리 id.
// id 는 라우트에서 /^\d+$/ 검증 후 전달되므로 정수 보간이 안전하다 (limit/offset 과 같은 근거)
function categoryWhere(category: string | null | undefined): string {
  if (category === "none") {
    return ` AND NOT EXISTS (SELECT 1 FROM item_categories ic WHERE ic.item_id = items.id)`;
  }
  if (category) {
    return ` AND EXISTS (SELECT 1 FROM item_categories ic
              WHERE ic.item_id = items.id AND ic.category_id = ${Number(category)})`;
  }
  return "";
}

// 대여 가능 조건 — shared/stock.isItemAvailable 과 같은 규칙 (유일한 차이는 SQL 표현).
// 소모품은 대여 대상이 아니므로 항상 "가능". 폐기(lifecycle)와 수리 소진·재고 0은 제외.
const AVAILABLE_SQL = `(items.kind = 'consumable'
   OR (items.lifecycle = 'active'
       AND (items.total_qty - items.qty_repair) > (SELECT COALESCE(SUM(r.qty), 0)
             FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented')))`;

// 대여 중 — 지금 점유가 있는 물품 (상태 탭 '대여 중')
const RENTED_SQL = `EXISTS (SELECT 1 FROM reservations r
   WHERE r.item_id = items.id AND r.status = 'rented')`;

// 대여 가능 종류 — 소모품은 '대여' 대상이 아니다 (요약 숫자와 같은 규칙)
const RENTAL_AVAILABLE_SQL = `(items.kind = 'rental' AND ${AVAILABLE_SQL})`;

// 상태 탭 필터 — 이슈 #12 §6.2 의 상태 칸과 같은 축.
//   rented    = 지금 대여 중 수량이 있는 물품 (종류)
//   available = 지금 빌릴 수 있는 대여품 (종류)
const stateWhere = (state: "rented" | "available" | null | undefined): string => {
  if (state === "rented") return ` AND ${RENTED_SQL}`;
  if (state === "available") return ` AND ${RENTAL_AVAILABLE_SQL}`;
  return "";
};

// ===== 전체 목록 (탐색 — 무한스크롤) =====

export type BrowseList = {
  items: ListItemWithBadge[];
  // state 필터를 무시한 전체 수 — '전체' 배지
  total: number;
  // available 필터를 적용한 수 — '대여 가능만' 배지
  available_total: number;
  // 실제로 적용된 필터(state·available)를 모두 통과한 수 — hasMore 계산용.
  // total 은 필터와 무관하므로 페이지네이션 종료 판정에 쓰면 안 된다(무한 루프).
  matched: number;
  // 목록 상단 요약 — state 필터와 무관한 모집단(폐기 제외) 기준
  summary: CatalogSummary;
};

// 텍스트 필터 — 이름·위치·범주 이름의 부분일치(LIKE). 랭킹 검색이 아니라
// 관리자 목록의 좁히기용이라 단순 LIKE다. %·_·\ 는 escapeLike로 무력화하고 값은
// 파라미터 바인딩한다(LIKE 폴백과 같은 근거)
function textFilter(q: string | null | undefined): { sql: string; params: string[] } {
  if (!q) return { sql: "", params: [] };
  return {
    sql: ` AND (items.name LIKE '%' || ?1 || '%' ESCAPE '\\'
          OR (COALESCE(l.name, '')) LIKE '%' || ?1 || '%' ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM item_categories ic
                      JOIN categories c ON c.id = ic.category_id
                      WHERE ic.item_id = items.id
                        AND c.name LIKE '%' || ?1 || '%' ESCAPE '\\'))`,
    params: [escapeLike(q)],
  };
}

/**
 * 전체 목록 — OFFSET/LIMIT 페이지네이션.
 * limit/offset은 라우트에서 정수로 클램프되고 category도 정수 검증을 거치므로
 * 문자열 보간이 안전하다. q는 바인드 파라미터라 임의 문자열이 안전하다.
 * withCategories — 관리자 요청: 행에 카테고리를 얹고 category 필터를 허용한다.
 * includeRetired — 관리자 요청: 폐기 물품도 목록에 포함한다 (물품 수정 선택 목록용).
 * q — 관리자 요청: 이름·위치·범주 이름 부분일치로 좁힌다.
 */
export async function listItems(
  db: Sql,
  opts: {
    limit: number;
    offset: number;
    available: boolean;
    category?: string | null;
    withCategories?: boolean;
    includeRetired?: boolean;
    q?: string;
    // 상태 탭 — null 이면 전체. summary·total 은 이 필터의 영향을 받지 않는다.
    state?: "rented" | "available" | null;
  },
): Promise<BrowseList> {
  const retired = opts.includeRetired ?? false;
  const tf = textFilter(opts.q);
  const state = opts.state ?? null;
  const where =
    (opts.available ? ` AND ${AVAILABLE_SQL}` : "") +
    stateWhere(state) +
    categoryWhere(opts.category) +
    tf.sql;
  // 행 필터 전체를 그대로 적용한 개수 — hasMore 종료 판정용
  const matchExpr =
    [
      opts.available ? AVAILABLE_SQL : "",
      state === "rented" ? RENTED_SQL : state === "available" ? RENTAL_AVAILABLE_SQL : "",
    ]
      .filter(Boolean)
      .join(" AND ") || "1=1";
  const [rows, counts] = (await Promise.all([
    db.query(
      `${buildListSql(where, opts.withCategories ?? false, retired)} LIMIT ${opts.limit} OFFSET ${opts.offset}`,
      tf.params,
    ),
    // 카운트 + 요약을 한 번에 — 예약은 item_id 로 미리 집계해 행이 늘지 않는다.
    // retired 는 counts 에는 포함되지만(includeRetired) 요약에는 들어가지 않는다.
    db.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN ${AVAILABLE_SQL} THEN 1 ELSE 0 END), 0) AS available_total,
              COALESCE(SUM(CASE WHEN ${matchExpr} THEN 1 ELSE 0 END), 0) AS matched,
              COALESCE(SUM(CASE WHEN items.lifecycle <> 'retired' THEN 1 ELSE 0 END), 0) AS types,
              COALESCE(SUM(CASE WHEN items.lifecycle <> 'retired' AND COALESCE(r.borrowed, 0) > 0 THEN 1 ELSE 0 END), 0) AS rented,
              COALESCE(SUM(CASE WHEN items.lifecycle <> 'retired' AND items.qty_repair > 0 THEN 1 ELSE 0 END), 0) AS repair,
              COALESCE(SUM(CASE
                WHEN items.lifecycle <> 'retired' AND items.kind = 'rental'
                 AND items.total_qty - items.qty_repair - COALESCE(r.borrowed, 0) > 0 THEN 1
                ELSE 0
              END), 0) AS available
       FROM items
       LEFT JOIN locations l ON l.id = items.location_id
       LEFT JOIN (SELECT item_id, SUM(qty) AS borrowed FROM reservations
                   WHERE status = 'rented' GROUP BY item_id) r ON r.item_id = items.id
      WHERE ${retired ? "" : "items.lifecycle <> 'retired' AND "}1=1${categoryWhere(opts.category)}${tf.sql}`,
      tf.params,
    ),
  ])) as [
    ListItemRow[],
    {
      total: number;
      available_total: number;
      matched: number;
      types: number;
      rented: number;
      repair: number;
      available: number;
    }[],
  ];
  const c = counts[0];
  return {
    items: parseListRows(rows).map(withAvailabilityBadge),
    total: Number(c.total),
    available_total: Number(c.available_total),
    matched: Number(c.matched),
    summary: {
      types: Number(c.types),
      available: Number(c.available),
      rented: Number(c.rented),
      repair: Number(c.repair),
    },
  };
}

// ===== 키워드 검색 (FTS5 bm25 + 1-2글자 LIKE 폴백) =====
// trigram 인덱스는 3글자 이상 토큰만 매치할 수 있다 — 3글자 이상은 FTS5 MATCH + bm25,
// 1-2글자(텐트·매트 같은 짧은 단어)는 escapeLike + LIKE 폴백으로 각각 독립 랭킹을 만들어
// RRF에서 융합한다. 후보 상한 50 — RRF 전 단계 후보라 넉넉히 뽑아도 최종 상위 30에 걸러진다.
const KEYWORD_CAP = 50;

// 토큰 길이 분리 — [...t] 코드 포인트 기준(한글 1글자 = 1)으로 센다
export function splitKeywordTokens(tokens: string[]): { long: string[]; short: string[] } {
  const long: string[] = [];
  const short: string[] = [];
  for (const t of tokens) ([...t].length >= 3 ? long : short).push(t);
  return { long, short };
}

// FTS5 MATCH 구문 — 토큰을 큰따옴표로 감싸 구문 주입 차단(AND·NEAR 같은 예약어도 리터럴이 됨),
// 내부 " 는 "" 로 이중화한다
export function ftsQuery(tokens: string[]): string {
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" AND ");
}

// FTS5 bm25 랭킹 — rowid = items.id. bm25 는 값이 작을수록 잘 맞는다.
// FTS 행은 상태를 모르므로 폐기(retired) 물품은 최종 목록 SQL에서 걸러진다
async function searchFtsRanked(db: Sql, tokens: string[]): Promise<number[]> {
  if (tokens.length === 0) return [];
  const rows = (await db.query(
    `SELECT rowid FROM items_fts WHERE items_fts MATCH ?1
     ORDER BY bm25(items_fts), rowid DESC LIMIT ${KEYWORD_CAP}`,
    [ftsQuery(tokens)],
  )) as { rowid: number }[];
  return rows.map((r) => r.rowid);
}

// LIKE 와일드카드(% _ \) 이스케이프 — '100%' 검색이 전부 매치되지 않게.
// SQLite LIKE 는 기본 이스케이프 문자가 없어 ESCAPE '\' 를 문장마다 명시해야 한다.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

// 가중치 점수 식 — SQLite 에선 LIKE/EXISTS 가 이미 1/0 을 돌려줘 Postgres 의 ::int 캐스트가 필요 없다.
// nullable 컬럼은 COALESCE 로 감싸지 않으면 NULL이 점수 전체를 오염시킨다
function likeScoreExpr(tokens: string[]): { expr: string; params: string[] } {
  let p = 0;
  const terms = tokens.map(() => {
    const name = `?${++p}`;
    const loc = `?${++p}`;
    const tag = `?${++p}`;
    const desc = `?${++p}`;
    return `(3 * (items.name LIKE '%' || ${name} || '%' ESCAPE '\\')
        + 2 * ((COALESCE(l.name, '')) LIKE '%' || ${loc} || '%' ESCAPE '\\')
        + 2 * (EXISTS (SELECT 1 FROM item_categories ic
                        JOIN categories c ON c.id = ic.category_id
                        WHERE ic.item_id = items.id
                          AND c.name LIKE '%' || ${tag} || '%' ESCAPE '\\'))
        + 1 * ((COALESCE(items.description, '')) LIKE '%' || ${desc} || '%' ESCAPE '\\'))`;
  });
  // 토큰은 파라미터 바인딩이라 SQL 주입은 없지만, %·_ 가 그대로 바인딩되면
  // 와일드카드로 작동해 '100%' 같은 검색어가 모든 물품에 점수를 주게 된다
  return {
    expr: `(${terms.join(" + ")})`,
    params: tokens.map(escapeLike).flatMap((t) => [t, t, t, t]),
  };
}

// 1-2글자 토큰 LIKE 폴백 — trigram 이 만들 수 없는 짧은 토큰의 랭킹 목록
async function searchLikeRankedIds(db: Sql, tokens: string[]): Promise<number[]> {
  if (tokens.length === 0) return [];
  const { expr, params } = likeScoreExpr(tokens);
  const rows = (await db.query(
    `SELECT items.id AS rowid, ${expr} AS score
     FROM items
     LEFT JOIN locations l ON l.id = items.location_id
     WHERE items.lifecycle <> 'retired' AND ${expr} > 0
     ORDER BY score DESC, items.id DESC
     LIMIT ${KEYWORD_CAP}`,
    params,
  )) as { rowid: number }[];
  return rows.map((r) => r.rowid);
}

// ===== 의미 검색 =====
// 쿼리 임베딩 캐시 — 워커 isolate 메모리에 검색어 정규화 키로 100개까지.
// 검색은 공개 엔드포인트라 같은 검색어 반복이 흔한데, 매번 Workers AI 를 부르면 무료 한도를 쓰고
// 검색마다 수백 ms 가 붙는다. isolate 가 살아 있는 동안만 유효하다(ponytail: 삽입순 FIFO 이고
// 기기 간 공유가 필요해지면 캐시 API/KV 로 승격).
const QUERY_VEC_CACHE = new Map<string, Float32Array>();
const QUERY_VEC_CACHE_MAX = 100;

async function embedQuery(env: Bindings, q: string): Promise<Float32Array> {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = QUERY_VEC_CACHE.get(key);
  if (hit !== undefined) return hit;
  const vec = await embed(env, q);
  if (QUERY_VEC_CACHE.size >= QUERY_VEC_CACHE_MAX) {
    const oldest = QUERY_VEC_CACHE.keys().next();
    if (!oldest.done) QUERY_VEC_CACHE.delete(oldest.value);
  }
  QUERY_VEC_CACHE.set(key, vec);
  return vec;
}

// 의미 후보 — 벡터 BLOB 전수 JS 코사인 상위 8개(유사도 ≥ 0.25). D1엔 pgvector 연산자가
// 없어 isolate 캐시 + 전수 코사인으로 대체한다. 후보는 RRF에서 키워드 순위와 경쟁하므로
// 좁혀 뽑아도 융합 상위 30에 걸러진다. bge-m3 유사도는 0.4~0.65에 뭉쳐 절대 임계로 관련/무관
// 구분이 안 되므로 → 상대 랭킹으로만 사용
const SEMANTIC_CAP = 8;
const SEMANTIC_MIN_SIM = 0.25;

/**
 * 의미 검색 랭킹 — 물품 id 목록(유사도 순). 실패해도 호출부를 죽이지 않고
 * 빈 배열을 돌려 키워드 결과만으로 검색이 계속되게 한다(폴백).
 */
async function semanticRankIds(
  env: Bindings,
  db: Sql,
  q: string,
): Promise<number[]> {
  try {
    const qv = await embedQuery(env, q);
    let qNorm = 0;
    for (let i = 0; i < qv.length; i++) qNorm += qv[i] * qv[i];
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const cache = await getVectorCache(db);
    const scored: { id: number; sim: number }[] = [];
    for (const [id, { v, norm }] of cache) {
      let dot = 0;
      for (let i = 0; i < qv.length; i++) dot += qv[i] * v[i];
      const sim = dot / (qNorm * norm);
      if (sim >= SEMANTIC_MIN_SIM) scored.push({ id, sim });
    }
    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, SEMANTIC_CAP).map((s) => s.id);
  } catch (err) {
    console.error("의미 검색 실패 — 키워드 결과만 사용", err);
    return [];
  }
}

// ===== 가용 배지 =====
// 키워드·의미·전체 목록이 같은 라벨을 쓴다. 판정 자체는 shared/stock 이 단일 출처다 —
// 예전엔 web/src/utils/stock.ts·이 함수·routes/items.ts 세 곳에 같은 규칙이 복사돼 있었다.
export function withAvailabilityBadge(r: ListItemRow): ListItemWithBadge {
  return { ...r, availability_badge: availabilityBadgeOf(r) };
}

// ===== 하이브리드 검색 =====
const SEARCH_RESULT_CAP = 30;

/**
 * 하이브리드 검색 — FTS5 bm25 랭킹·LIKE 폴백 랭킹·의미 랭킹을 RRF로 융합해 상위 30개만 내린다.
 * 한 물품이 여러 후보 목록에 나오면 점수가 합쳐져 위로 간다 — 순서가 랭킹 논리로 설명된다.
 * 의미 검색(Workers AI)이 실패하면 키워드 목록만으로 검색이 계속된다(폴백).
 * @param q - 검색어 (공백 분해, 최대 5토큰)
 * @param opts.withCategories - 관리자 요청: 행에 카테고리를 얹는다 (클라이언트 필터용)
 */
export async function searchHybrid(
  env: Bindings,
  db: Sql,
  q: string,
  opts: { withCategories?: boolean } = {},
): Promise<ListItemWithBadge[]> {
  // 토큰 처리: 단어 단위 (최대 5개 토큰)
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length === 0) return [];
  const { long, short } = splitKeywordTokens(tokens);

  const [ftsIds, likeIds, semIds] = await Promise.all([
    searchFtsRanked(db, long),
    searchLikeRankedIds(db, short),
    semanticRankIds(env, db, tokens.join(" ")),
  ]);

  const fusedIds = fuseRRF([ftsIds, likeIds, semIds]).slice(
    0,
    SEARCH_RESULT_CAP,
  );
  if (fusedIds.length === 0) return [];

  // 융합 순위를 JS에서 복원 — SQL은 id 집합으로 목록 컬럼(사진·태그·active_now)만 가져온다
  const rank = new Map(fusedIds.map((id, i) => [id, i]));
  const rows = parseListRows(
    (await db.query(
      buildListSql(` AND items.id IN (SELECT value FROM json_each(?1))`, opts.withCategories ?? false),
      [JSON.stringify(fusedIds)],
    )) as ListItemRow[],
  );
  rows.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  return rows.map(withAvailabilityBadge);
}

// ===== RRF (Reciprocal Rank Fusion) =====
/**
 * 여러 순위 목록을 하나의 순위로 융합한다.
 * @param lists - 랭킹 목록들, 각 index 0이 1위 (FTS5 bm25·LIKE 점수·코사인)
 * @param k - 완화 상수. 순위 차이를 부드럽게 만든다 (정보검색 표준값 60)
 * @returns 융합 순위의 물품 id (중복 없음)
 */
export function fuseRRF(lists: number[][], k = 60): number[] {
  // 여러 목록에 모두 나온 물품은 점수가 합산되어 위로 간다 —
  // "키워드+의미 둘 다 맞는 물품이 가장 관련성 높다"는 융합의 핵심 논리
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)); // rank는 1부터 — 인덱스(i)는 0부터라 +1
    });
  }

  // 점수 내림차순. 동률은 id DESC — 홈 목록 정렬(최근 등록 우선)과 통일
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([id]) => id);
}
