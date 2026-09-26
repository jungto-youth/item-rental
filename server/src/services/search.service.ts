// 검색·탐색 서비스 — "탐색"(전체 목록 무한스크롤)과 "검색"(랭킹된 짧은 리스트)을 분리한다.
// 검색 = FTS5 bm25 랭킹(3글자↑ 토큰) + LIKE 폴백 랭킹(1-2글자 토큰) + 의미(벡터 BLOB JS 코사인)
// 를 RRF로 융합해 상위 N개만 내린다 (PLAN §7.4).
// 검색에는 페이지네이션이 없다 — 퍼지 매치의 꼬리는 노이즈라 "2페이지"가 의미 없다.
import type { Sql } from "../db";
import type { Bindings } from "../types";
import type { AvailabilityBadge } from "../../../shared/api-types";
import type { ListItemRow } from "./items.service";
import { parseJsonCol } from "./items.service";
import { embed, getVectorCache } from "../embedding";

// 배지까지 계산된 목록 행 — 화면(web/src/types.ts Item)과 같은 모양
export type ListItemWithBadge = ListItemRow & {
  availability_badge: AvailabilityBadge | null;
};

// 목록 SELECT 공용 — 전체 목록/키워드/의미가 같은 컬럼을 내려준다 (where 절만 다름)
// json 집계는 SQLite가 ORDER BY를 지원하지 않아 정렬용 서브쿼리로 감싼다 (PLAN §6 규칙표)
const LIST_COLUMNS = `SELECT items.id, items.name, items.description, items.total_qty, items.status,
            items.kind, items.location,
            items.qty_broken,
            (items.total_qty - items.qty_broken) AS rentable_qty,
            (SELECT json_group_array(json_object('id', p.id, 'url', '/api/photos/' || p.r2_key))
             FROM (SELECT p.id, p.r2_key FROM item_photos p
                    WHERE p.item_id = items.id ORDER BY p.sort_order) p) AS photos,
            (SELECT COALESCE(SUM(r.qty), 0) FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented') AS active_now`;

function parseListRows(rows: ListItemRow[]): ListItemRow[] {
  for (const r of rows) r.photos = parseJsonCol(r.photos);
  return rows;
}

function buildListSql(where: string): string {
  return `${LIST_COLUMNS}
     FROM items
     WHERE items.status <> 'retired' ${where}
     ORDER BY items.id DESC`;
}

// 대여 가능 조건 — 홈 화면 isItemAvailable(web/src/pages/home.ts)과 같은 규칙.
// 소모품은 대여 대상이 아니므로 항상 "가능". repair 상태와 수량 0은 제외.
const AVAILABLE_SQL = `(items.kind = 'consumable'
   OR (items.status = 'active'
       AND (items.total_qty - items.qty_broken) > (SELECT COALESCE(SUM(r.qty), 0)
             FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented')))`;

// ===== 전체 목록 (탐색 — 무한스크롤) =====

export type BrowseList = {
  items: ListItemWithBadge[];
  // available 필터를 무시한 전체 수 — '전체' 배지
  total: number;
  // available 필터를 적용한 수 — '대여 가능만' 배지
  available_total: number;
};

/**
 * 전체 목록 — OFFSET/LIMIT 페이지네이션.
 * limit/offset은 라우트에서 정수로 클램프되므로 문자열 보간이 안전하다.
 */
export async function listItems(
  db: Sql,
  opts: { limit: number; offset: number; available: boolean },
): Promise<BrowseList> {
  const where = opts.available ? ` AND ${AVAILABLE_SQL}` : "";
  const [rows, counts] = (await Promise.all([
    db.query(`${buildListSql(where)} LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    db.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN ${AVAILABLE_SQL} THEN 1 ELSE 0 END), 0) AS available_total
       FROM items WHERE status <> 'retired'`,
    ),
  ])) as [ListItemRow[], { total: number; available_total: number }[]];
  return {
    items: parseListRows(rows).map(withAvailabilityBadge),
    total: counts[0].total,
    available_total: counts[0].available_total,
  };
}

// ===== 키워드 검색 (FTS5 bm25 + 1-2글자 LIKE 폴백, PLAN §7.4) =====
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

// FTS5 bm25 랭킹 — rowid = items.id (§7.3). bm25 는 값이 작을수록 잘 맞는다.
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
        + 2 * ((COALESCE(items.location, '')) LIKE '%' || ${loc} || '%' ESCAPE '\\')
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

// 1-2글자 토큰 LIKE 폴백 — trigram 이 만들 수 없는 짧은 토큰의 랭킹 목록(§7.4)
async function searchLikeRankedIds(db: Sql, tokens: string[]): Promise<number[]> {
  if (tokens.length === 0) return [];
  const { expr, params } = likeScoreExpr(tokens);
  const rows = (await db.query(
    `SELECT items.id AS rowid, ${expr} AS score
     FROM items
     WHERE items.status <> 'retired' AND ${expr} > 0
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

// 의미 후보 — 벡터 BLOB 전수 JS 코사인 상위 8개(유사도 ≥ 0.25, §7.4). D1엔 pgvector 연산자가
// 없어 isolate 캐시 + 전수 코사인으로 대체한다(§7.2). 후보는 RRF에서 키워드 순위와 경쟁하므로
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
// 키워드·의미·전체 목록이 같은 라벨을 쓴다 (상세도 같은 규칙: routes/items.ts)
// 날짜 개념이 없어져 '예약 있음'(reserved)은 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다
export function withAvailabilityBadge(r: ListItemRow): ListItemWithBadge {
  return {
    ...r,
    availability_badge:
      r.kind === "consumable"
        ? null
        : r.status === "repair" || r.rentable_qty <= 0
          ? "repair"
          : r.active_now >= r.rentable_qty
            ? "rented"
            : "available",
  };
}

// ===== 하이브리드 검색 =====
const SEARCH_RESULT_CAP = 30;

/**
 * 하이브리드 검색 — FTS5 bm25 랭킹·LIKE 폴백 랭킹·의미 랭킹을 RRF로 융합해 상위 30개만 내린다.
 * 한 물품이 여러 후보 목록에 나오면 점수가 합쳐져 위로 간다 — 순서가 랭킹 논리로 설명된다.
 * 의미 검색(Workers AI)이 실패하면 키워드 목록만으로 검색이 계속된다(폴백).
 * @param q - 검색어 (공백 분해, 최대 5토큰)
 */
export async function searchHybrid(
  env: Bindings,
  db: Sql,
  q: string,
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
      buildListSql(` AND items.id IN (SELECT value FROM json_each(?1))`),
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
