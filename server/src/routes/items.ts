import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { requireAuth } from "../middleware/auth";
import { searchHybrid, listItems } from "../services/search.service";
import { getItemDetail } from "../services/items.service";
import { availabilityBadgeOf } from "../../../shared/stock";

// GET /api/items, /api/items/:id (활성 회원 전용)
export const itemsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
itemsRoute.use("*", requireAuth);

// 쿼리 파라미터 클램프 — LIMIT/OFFSET 을 SQL 에 그대로 넣기 전에 정수로 한정한다
function clampInt(
  raw: string | undefined,
  dflt: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

// 검색 레이트 리밋 — 의미 검색은 Workers AI 를 부르므로 로테이션
// 쿼리로 무료 한도를 태우는 걸 막는다. isolate 로컬 고정창(분당)이라 정확한 계정당
// 제한은 아니지만 비용 폭주를 잡는 1차 방어로 충분하다. 초과 시 429.
const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_WINDOW = 30;
const SEARCH_HITS = new Map<string, { win: number; n: number }>();

function searchThrottled(ip: string): boolean {
  const now = Date.now();
  const hit = SEARCH_HITS.get(ip);
  if (!hit || now - hit.win >= SEARCH_WINDOW_MS) {
    // Map이 커지지 않게 창이 지난 첫 항목 하나를 골라 재사용한다
    if (SEARCH_HITS.size > 1000) SEARCH_HITS.clear();
    SEARCH_HITS.set(ip, { win: now, n: 1 });
    return false;
  }
  hit.n += 1;
  return hit.n > SEARCH_MAX_PER_WINDOW;
}

// 목록 — 탐색(전체 목록 무한스크롤)과 검색(랭킹된 짧은 리스트)을 분리
// (`location` 컬럼이 실데이터로 채워졌다. 검색창 문구가 '이름·설명·위치'라고
//  안내하는데 서버가 위치를 안 봐서 안내가 거짓이었음)
itemsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const q = (c.req.query("q") ?? "").trim();
  if (q.length > 512) return c.json({ error: "query_too_long" }, 400);

  // 관리자 세션이면 행에 카테고리를 얹고 카테고리 필터를 허용한다 —
  // 일반 회원 응답은 관리 목록 통합 이전과 같은 모양을 유지한다
  const user = c.get("user")!;
  const isAdmin = user.role === "admin";

  // 검색 — 키워드+의미를 RRF 로 융합한 상위 30개. 검색에는 페이지네이션이 없다:
  // 퍼지 매치의 꼬리는 노이즈라 "페이지 2"를 보여줘도 아무도 안 본다
  if (q) {
    if (searchThrottled(c.req.header("cf-connecting-ip") ?? "unknown")) {
      return c.json({ error: "too_many_requests" }, 429);
    }
    // 분류는 목록 행의 '분류' 칸이 쓰므로 회원 응답에도 얹는다 (이슈 #12 §6.1).
    // 태그는 민감 정보가 아니고, 행 렌더가 관리자/회원에 따라 갈리지 않게 한다.
    const items = await searchHybrid(c.env, db, q, { withCategories: true });
    return c.json({ items });
  }

  // 탐색 — 전체 목록을 OFFSET/LIMIT 으로 나눠 내린다 (홈 무한스크롤)
  const limit = clampInt(c.req.query("limit"), 24, 1, 60);
  const offset = clampInt(c.req.query("offset"), 0, 0, 100_000);
  const available = c.req.query("available") === "1";
  // 상태 탭 — 전체(all) · 대여 중 · 대여 가능 (이슈 #12 §6.2)
  const stateRaw = c.req.query("state");
  const state = stateRaw === "rented" || stateRaw === "available" ? stateRaw : null;
  // 카테고리 필터 — 관리자 전용. "none"(미지정) 또는 숫자 id 만 받고 이외는 무시
  const categoryRaw = c.req.query("category") ?? "";
  const category =
    isAdmin && (categoryRaw === "none" || /^\d+$/.test(categoryRaw)) ? categoryRaw : null;
  const { items, total, available_total, matched, summary } = await listItems(db, {
    limit,
    offset,
    available,
    state,
    category,
    // 분류 칸은 회원 목록에서도 보인다 — 행 모양을 관리자/회원이 공유한다
    withCategories: true,
  });
  return c.json({
    items,
    total,
    available_total,
    matched,
    summary,
    // 종료 판정은 필터를 모두 적용한 수(matched)로 — total 은 필터와 무관하다
    hasMore: offset + items.length < matched,
  });
});

// 상세 — 설명·수량 + 현재 대여 중 수량 (회원 정보 제외)
itemsRoute.get("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const item = await getItemDetail(db, id);
  if (!item) return c.json({ error: "not_found" }, 404);

  // 목록과 같은 기준의 가용 배지 — 상세도 같은 라벨을 쓴다. 판정은 shared/stock 단일 출처.
  // 소모품은 대여 대상이 아니라 null 을 내려 화면이 '대여 가능/대여 중' 배지를 아예 안 그리게 한다.
  const availability_badge = availabilityBadgeOf(item);

  return c.json({ item: { ...item, availability_badge } });
});
