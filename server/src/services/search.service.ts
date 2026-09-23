// 검색·탐색 서비스 — "탐색"(전체 목록 무한스크롤)과 "검색"(랭킹된 짧은 리스트)을 분리한다.
// 검색 = 키워드(OR-완화 가중치 랭킹) + 의미(pgvector) 후보를 RRF로 융합해 상위 N개만 내린다.
// 검색에는 페이지네이션이 없다 — 퍼지 매치의 꼬리는 노이즈라 "2페이지"가 의미 없다.
import type { Sql } from "../db";
import type { Bindings } from "../types";
import type { ListItemRow } from "./items.service";
import { embed } from "../embedding";

// 배지까지 계산된 목록 행 — 화면(web/src/types.ts Item)과 같은 모양
export type ListItemWithBadge = ListItemRow & {
  availability_badge: "available" | "rented" | "repair" | null;
};

// 목록 SELECT 공용 — 전체 목록/키워드/의미가 같은 컬럼을 내려준다 (where 절만 다름)
const LIST_COLUMNS = `SELECT items.id, items.name, items.description, items.total_qty, items.status,
            items.kind, items.location,
            items.qty_broken,
            (items.total_qty - items.qty_broken) AS rentable_qty,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos,
            (SELECT COALESCE(SUM(r.qty), 0)::int FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented') AS active_now`;

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
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ${AVAILABLE_SQL})::int AS available_total
       FROM items WHERE status <> 'retired'`,
    ),
  ])) as [ListItemRow[], { total: number; available_total: number }[]];
  return {
    items: rows.map(withAvailabilityBadge),
    total: counts[0].total,
    available_total: counts[0].available_total,
  };
}

// ===== 키워드 검색 (OR-완화 + 가중치 랭킹) =====
// 토큰별 점수: 이름 ×3 · 태그/위치 ×2 · 설명 ×1. AND가 아니라 OR이므로 토큰 하나만
// 맞아도 후보가 되고, 점수 순으로 여러 토큰을 다 맞춘 물품이 위로 온다.
// (기존 AND 검색은 토큰 하나만 안 맞아도 결과 0개라 의미 검색 폴백에 전부 의존했다)
// ILIKE '%…%'는 btree 인덱스를 못 쓰지만 pg_trgm GIN 인덱스(0022)가 가속한다.
const KEYWORD_CAP = 40;

// 가중치 점수 식 — boolean::int 로 매치를 1/0 으로 세어 가중치를 곱해 더한다.
// nullable 컬럼은 COALESCE 로 감싸지 않으면 NULL이 점수 전체를 오염시킨다.
// LIKE 와일드카드(% _ \) 이스케이프 — '100%' 검색이 전부 매치되지 않게
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

function scoreExpr(tokens: string[]): { expr: string; params: string[] } {
  let p = 0;
  const terms = tokens.map(() => {
    const name = `$${++p}`;
    const loc = `$${++p}`;
    const tag = `$${++p}`;
    const desc = `$${++p}`;
    return `(3 * ((items.name ILIKE '%' || ${name} || '%')::int)
        + 2 * ((COALESCE(items.location, '') ILIKE '%' || ${loc} || '%')::int)
        + 2 * ((EXISTS (SELECT 1 FROM item_categories ic
                        JOIN categories c ON c.id = ic.category_id
                        WHERE ic.item_id = items.id
                          AND c.name ILIKE '%' || ${tag} || '%'))::int)
        + 1 * ((COALESCE(items.description, '') ILIKE '%' || ${desc} || '%')::int))`;
  });
  // 토큰은 파라미터 바인딩이라 SQL 주입은 없지만, %·_ 가 그대로 바인딩되면
  // 와일드카드로 작동해 '100%' 같은 검색어가 모든 물품에 점수를 주게 된다
  return {
    expr: `(${terms.join(" + ")})`,
    params: tokens.map(escapeLike).flatMap((t) => [t, t, t, t]),
  };
}

export async function searchKeywordRanked(
  db: Sql,
  tokens: string[],
): Promise<ListItemRow[]> {
  if (tokens.length === 0) return [];
  const { expr, params } = scoreExpr(tokens);
  const rows = (await db.query(
    `${LIST_COLUMNS},
            ${expr} AS score
     FROM items
     WHERE items.status <> 'retired' AND ${expr} > 0
     ORDER BY score DESC, items.id DESC
     LIMIT ${KEYWORD_CAP}`,
    params,
  )) as ListItemRow[];
  return rows;
}

// ===== 의미 검색 =====
// 쿼리 임베딩 캐시 — 워커 isolate 메모리에 검색어 정규화 키로 100개까지.
// 검색은 공개 엔드포인트라 같은 검색어 반복이 흔한데, 매번 Workers AI 를 부르면 무료 한도를 쓰고
// 검색마다 수백 ms 가 붙는다. isolate 가 살아 있는 동안만 유효하다(ponytail: 삽입순 FIFO 이고
// 기기 간 공유가 필요해지면 캐시 API/KV 로 승격).
const QUERY_VEC_CACHE = new Map<string, string>();
const QUERY_VEC_CACHE_MAX = 100;

async function embedQuery(env: Bindings, q: string): Promise<string> {
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

// 의미 후보 — pgvector cosine distance 상위 30개. 임계 0.75→0.8 로 완화했다:
// 후보는 RRF에서 키워드 순위와 경쟁하므로 넉넉히 뽑아도 최종 상위 30에 걸러진다.
// bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계로 관련/무관 구분이 안 되므로 → 상대 랭킹으로만 사용
function semanticSearchSql(): string {
  return `SELECT id FROM items
   WHERE status <> 'retired' AND embedding IS NOT NULL
     AND embedding <=> $1::vector < 0.8
   ORDER BY embedding <=> $1::vector
   LIMIT 30`;
}

/**
 * 의미 검색 — 임베딩으로 관련성 높은 항목 검색. 실패해도 호출부를 죽이지 않고
 * 빈 배열을 돌려 키워드 결과만으로 검색이 계속되게 한다.
 * 키워드 결과를 제외하지 않는다 — 융합(fuseRRF)에서 양쪽에 나온 물품의 점수가 합쳐진다.
 * @returns ListItemRow 배열 (거리 순서대로)
 */
export async function searchSemanticItems(
  env: Bindings,
  db: Sql,
  q: string,
): Promise<ListItemRow[]> {
  try {
    const vec = await embedQuery(env, q);
    const rows = (await db.query(semanticSearchSql(), [vec])) as {
      id: number;
    }[];

    if (rows.length === 0) return [];

    // ID 목록으로 SQL WHERE 절 생성
    const ids = rows.map((r) => r.id);

    // listSql이 id DESC로 정렬하므로 거리 순위를 JS에서 복원
    const rank = new Map(ids.map((id, i) => [id, i]));
    const semanticRows = (await db.query(
      buildListSql(` AND items.id = ANY(string_to_array($1, ',')::int[])`),
      [ids.join(",")],
    )) as ListItemRow[];
    semanticRows.sort(
      (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
    );

    return semanticRows;
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
 * 하이브리드 검색 — 키워드 랭킹과 의미 랭킹을 RRF로 융합해 상위 30개만 내린다.
 * 기존 "키워드 결과 + 의미 결과 이어붙이기"와 달리 한 물품이 양쪽 후보에 나오면
 * 점수가 합쳐져 위로 간다 — 순서가 랭킹 논리로 설명된다.
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

  const [kwRows, semRows] = await Promise.all([
    searchKeywordRanked(db, tokens),
    searchSemanticItems(env, db, tokens.join(" ")),
  ]);

  return fuseRRF(kwRows, semRows)
    .slice(0, SEARCH_RESULT_CAP)
    .map(withAvailabilityBadge);
}

// ===== RRF (Reciprocal Rank Fusion) =====
/**
 * 두 순위 목록을 하나의 순위로 융합한다.
 * @param keywordRows - 키워드 랭킹 (점수 DESC — index 0이 1위)
 * @param semanticRows - 의미 랭킹 (거리 ASC — index 0이 1위)
 * @param k - 완화 상수. 순위 차이를 부드럽게 만든다 (정보검색 표준값 60)
 * @returns 융합 순위로 정렬된 물품 (id 중복 없음)
 */
export function fuseRRF(
  keywordRows: ListItemRow[],
  semanticRows: ListItemRow[],
  k = 60,
): ListItemRow[] {
  // id → {행, RRF 점수}. 양쪽 목록에 모두 나온 물품은 점수가 합산되어 위로 간다 —
  // "키워드+의미 둘 다 맞는 물품이 가장 관련성 높다"는 융합의 핵심 논리
  const best = new Map<number, { row: ListItemRow; s: number }>();
  const add = (rows: ListItemRow[]) =>
    rows.forEach((row, i) => {
      const hit = best.get(row.id) ?? { row, s: 0 };
      hit.s += 1 / (k + i + 1); // rank는 1부터 — SQL 인덱스(i)는 0부터라 +1
      best.set(row.id, hit);
    });
  add(keywordRows);
  add(semanticRows);

  // 점수 내림차순. 동률은 id DESC — 홈 목록 정렬(최근 등록 우선)과 통일
  return [...best.values()]
    .sort((a, b) => b.s - a.s || b.row.id - a.row.id)
    .map(({ row }) => row);
}
