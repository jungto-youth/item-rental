// 검색 서비스 — 키워드 + 의미 검색을 조합하여 검색 로직 통합
// SPEC §4.2 — 2단계 검색 (키워드 ILIKE + semanticItemIds pgvector)
import type { Sql } from "../db";
import type { Bindings } from "../types";
import type { ListItemRow } from "./items.service";
import { embed } from "../embedding";

// 배지까지 계산된 목록 행 — 화면(web/src/types.ts Item)과 같은 모양
export type ListItemWithBadge = ListItemRow & {
  availability_badge: "available" | "rented" | "repair" | null;
};

// 목록 SELECT 공용 — 키워드/의미 두 단계가 where 절만 다르게 재사용
function buildListSql(where: string): string {
  return `SELECT items.id, items.name, items.description, items.total_qty, items.status,
            items.kind, items.location,
            items.qty_broken,
            (items.total_qty - items.qty_broken) AS rentable_qty,
            (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'url', '/api/photos/' || p.r2_key)
                              ORDER BY p.sort_order), '[]'::json)
             FROM item_photos p WHERE p.item_id = items.id) AS photos,
            (SELECT COALESCE(SUM(r.qty), 0)::int FROM reservations r
             WHERE r.item_id = items.id AND r.status = 'rented') AS active_now
     FROM items
     WHERE items.status <> 'retired' ${where}
     ORDER BY items.id DESC`;
}

// 의미 후보 — pgvector cosine distance 상위 8개 (§4.2)
function semanticSearchSql(): string {
  return `SELECT id FROM items
   WHERE status <> 'retired' AND embedding IS NOT NULL
     AND embedding <=> $1::vector < 0.75
   ORDER BY embedding <=> $1::vector
   LIMIT 8`;
}

// ===== 키워드 검색 =====
/**
 * 토큰으로 단어 단위 AND 검색 — 각 단어가 이름·설명·위치 중 하나라도 매치되면 통과
 * @param db - Neon SQL 클라이언트
 * @param tokens - 검색 토큰 배열 (최대 5개)
 * @param whereExtra - 추가 WHERE 조건 (있는 경우)
 * @returns ListItemRow 배열
 */
export async function searchItems(
  db: Sql,
  tokens: string[],
  whereExtra: string = "",
): Promise<ListItemRow[]> {
  if (tokens.length === 0) return [];

  // 각 토큰에 대해 (items.name ILIKE ? OR items.description ILIKE ? OR items.location ILIKE ?)
  const searchConds = tokens
    .map(
      (_, i) =>
        `(items.name ILIKE '%' || $${i + 1} || '%'
        OR items.description ILIKE '%' || $${i + 1} || '%'
        OR items.location ILIKE '%' || $${i + 1} || '%')`,
    )
    .join(" AND ");

  const kwWhere = ` AND ${searchConds}`;
  return (await db.query(buildListSql(kwWhere), tokens)) as ListItemRow[];
}

// ===== 의미 검색 =====
/**
 * 의미 검색 — 임베딩을 사용하여 관련성 높은 항목 검색
 * bge-m3 거리는 0.4~0.65에 뭉쳐 절대 임계로 관련/무관 구분이 안 되므로 → 상대 랭킹으로만 사용
 * @param env - Cloudflare Workers 바인딩
 * @param db - Neon SQL 클라이언트
 * @param q - 쿼리 텍스트 (임베딩 생성용)
 * @param excludeIds - 제외할 항목 ID 집합 (키워드 검색 결과에서 제외된 항목)
 * @returns ListItemRow 배열 (거리 순서대로)
 */
export async function searchSemanticItems(
  env: Bindings,
  db: Sql,
  q: string,
  excludeIds: Set<number> = new Set(),
): Promise<ListItemRow[]> {
  try {
    const vec = await embed(env, q);
    const rows = (await db.query(semanticSearchSql(), [vec])) as {
      id: number;
    }[];

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const filteredIds = [...ids].filter((id) => !excludeIds.has(id));
    if (filteredIds.length === 0) return [];

    // ID 목록으로 SQL WHERE 절 생성
    const idList = filteredIds.join(",");
    const semanticRows = (await db.query(
      buildListSql(` AND items.id = ANY(string_to_array($1, ',')::int[])`),
      [idList],
    )) as ListItemRow[];

    // listSql이 id DESC로 정렬하므로 거리 순위를 JS에서 복원
    const rank = new Map(filteredIds.map((id, i) => [id, i]));
    semanticRows.sort(
      (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
    );

    return semanticRows;
  } catch (err) {
    console.error("의미 검색 실패 — 키워드 검색으로 폴백", err);
    return [];
  }
}

// ===== 전체 목록 (검색어 없음) =====
// 가용 배지 계산 — 키워드·의미·전체 목록이 같은 라벨을 쓴다 (상세도 같은 규칙: routes/items.ts)
// 날짜 개념이 없어져 '예약 있음'(reserved)은 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다
function withAvailabilityBadge(r: ListItemRow): ListItemWithBadge {
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

/**
 * 전체 목록 — 검색어가 없을 때 홈이 부르는 경로 (§4.2)
 * 정렬·필터는 buildListSql 그대로 (id DESC = 최근 등록 우선, retired 는 SQL 이 제외)
 */
export async function listItems(db: Sql): Promise<ListItemWithBadge[]> {
  const rows = (await db.query(buildListSql(""))) as ListItemRow[];
  return rows.map(withAvailabilityBadge);
}

// ===== 전체 검색 (키워드 + 의미) =====
/**
 * 전체 검색 — 키워드 검색 후 의미 검색 순으로 결과 반환
 * @param env - Cloudflare Workers 바인딩
 * @param db - Neon SQL 클라이언트
 * @param q - 검색어
 * @returns ListItemWithBadge 배열 (키워드 결과 먼저, 그 다음 의미 결과)
 */
export async function searchItemsCombined(
  env: Bindings,
  db: Sql,
  q: string,
): Promise<ListItemWithBadge[]> {
  // 토큰 처리: 단어 단위 AND 검색 (최대 5개 토큰)
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);

  if (tokens.length === 0) return [];

  // 1단계 — 키워드 매치 (정확 검색이 항상 앞에 옴)
  const kwRows = await searchItems(db, tokens);

  // 2단계 — 의미 매치 (키워드에 이미 나온 물품 제외, 거리순)
  const kwIds = new Set(kwRows.map((r) => r.id));
  const semRows = await searchSemanticItems(env, db, tokens.join(" "), kwIds);

  // 가용 배지 계산 (전체 목록과 같은 helper)
  return [...kwRows, ...semRows].map(withAvailabilityBadge);
}
