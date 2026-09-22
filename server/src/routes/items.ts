import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { searchItemsCombined, listItems } from "../services/search.service";
import { getItemDetail } from "../services/items.service";

// GET /api/items, /api/items/:id (전체 열람 가능)
export const itemsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// 목록 — 검색(키워드 → 의미 순) + 가용 배지 ()
// (v3.0 — `location` 컬럼이 실데이터로 채워졌다. 검색창 문구가 '이름·설명·위치'라고
//  안내하는데 서버가 위치를 안 봐서 안내가 거짓이었음)
itemsRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const q = (c.req.query("q") ?? "").trim();
  // 검색어가 없으면 전체 목록 - 이전에는 빈 배열을 내려 홈이 늘 "물품이 없어요" 였다
  const items = q
    ? await searchItemsCombined(c.env, db, q)
    : await listItems(db);
  return c.json({ items });
});

// 상세 — 설명·수량 + 현재 대여 중 수량 (회원 정보 제외)
itemsRoute.get("/:id", async (c) => {
  const db: Sql = getDb(c.env);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const item = await getItemDetail(db, id);
  if (!item) return c.json({ error: "not_found" }, 404);

  // 목록과 같은 기준의 가용 배지 — 상세도 같은 라벨을 쓴다. 소모품은 대여 대상이 아니라 null 을 내려
  // 화면이 '대여 가능/대여 중' 배지를 아예 안 그리게 한다 ().
  // 날짜 개념이 없어져 '예약 있음'(reserved)은 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다.
  const availabilityBadge =
    item.kind === "consumable"
      ? null
      : item.status === "repair" || item.rentable_qty <= 0
        ? "repair"
        : item.active_now >= item.rentable_qty
          ? "rented"
          : "available";

  return c.json({ item: { ...item, availability_badge: availabilityBadge } });
});
