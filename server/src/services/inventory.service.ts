// 재고 수량 조정 서비스 — 보유 수량(total_qty)의 증감과 이력 INSERT 를 한 batch 로 묶는다.
// 수리 중 수량(qty_repair)은 이번 범위에서 기존 물품 수정 폼이 계속 맡는다.
import type { Sql } from "../db";
import type {
  AdminInventoryAdjustment,
  InventoryAdjustmentKind,
} from "../../../shared/api-types";

export const ADJUSTMENT_KINDS: InventoryAdjustmentKind[] = [
  "add",
  "lost",
  "dispose",
];

export type AdjustResult =
  | { ok: true; total_qty: number }
  | {
      error:
        | "not_found"
        | "invalid_kind"
        | "invalid_qty"
        | "min_qty"
        | "repair_qty_constraint"
        | "rented_qty_constraint"
        | "conflict";
    };

type ItemQty = { total_qty: number; qty_repair: number };

// 최근 조정 이력 — 처리자 이름을 join 으로 풀어 화면이 한 번에 그린다.
export async function listAdjustments(
  db: Sql,
  itemId: number,
  limit = 20,
): Promise<AdminInventoryAdjustment[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  return (await db.query(
    `SELECT a.id, a.item_id, a.kind, a.qty, a.total_qty_before, a.total_qty_after,
            a.memo, a.actor_id, m.name AS actor_name, a.created_at
       FROM inventory_adjustments a
       LEFT JOIN members m ON m.id = a.actor_id
      WHERE a.item_id = ?1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?2`,
    [itemId, safeLimit],
  )) as AdminInventoryAdjustment[];
}

// 조정 적용 — 아래 불변식을 지킨다.
//   - 보유 수량은 1 이상 (0으로 만들려면 상태를 폐기로 바꾼다)
//   - 수리 중 수량보다 작아질 수 없다 (qty_repair <= total_qty)
//   - 대여 중인 수량보다 작아질 수 없다 (재고가 음수가 되지 않는다)
// 사전 검사는 친절한 오류 코드용이고, batch 의 UPDATE 가드가 최종 판정이다.
export async function adjustItemQuantity(
  db: Sql,
  input: {
    itemId: number;
    actorId: string;
    kind: InventoryAdjustmentKind;
    qty: number;
    memo: string | null;
  },
): Promise<AdjustResult> {
  const { itemId, actorId, kind, qty, memo } = input;
  if (!ADJUSTMENT_KINDS.includes(kind)) return { error: "invalid_kind" };
  if (!Number.isInteger(qty) || qty < 1) return { error: "invalid_qty" };

  const [item] = (await db.query(
    `SELECT total_qty, qty_repair FROM items WHERE id = ?1`,
    [itemId],
  )) as ItemQty[];
  if (!item) return { error: "not_found" };

  const delta = kind === "add" ? qty : -qty;
  const before = item.total_qty;
  const after = before + delta;
  if (after < 1) return { error: "min_qty" };
  if (after < item.qty_repair) return { error: "repair_qty_constraint" };

  const [active] = (await db.query(
    `SELECT COALESCE(SUM(qty), 0) AS active_now FROM reservations
      WHERE item_id = ?1 AND status = 'rented'`,
    [itemId],
  )) as { active_now: number }[];
  if (after - item.qty_repair < active.active_now) {
    return { error: "rented_qty_constraint" };
  }

  // UPDATE 와 이력 INSERT 를 한 트랜잭션으로. UPDATE 가 0행이면 INSERT 의 EXISTS 도
  // 거짓이 되어 이력만 남는 부분 상태가 생기지 않는다. updated_at 의 토큰은 같은
  // 요청 안에서만 쓰는 값이라, 사이에 다른 관리자가 같은 수량으로 바꿔도 구분된다.
  const token = new Date().toISOString();
  const results = await db.batch<{ id: number }>([
    {
      sql: `UPDATE items SET total_qty = ?2, updated_at = ?3
             WHERE id = ?1 AND total_qty = ?4
               AND ?2 >= qty_repair
               AND (?2 - qty_repair) >=
                   (SELECT COALESCE(SUM(qty), 0) FROM reservations
                     WHERE item_id = ?1 AND status = 'rented')
             RETURNING id`,
      params: [itemId, after, token, before],
    },
    {
      sql: `INSERT INTO inventory_adjustments
              (item_id, kind, qty, total_qty_before, total_qty_after, memo, actor_id)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
             WHERE EXISTS (SELECT 1 FROM items
                            WHERE id = ?1 AND total_qty = ?5 AND updated_at = ?8)
            RETURNING id`,
      params: [itemId, kind, qty, before, after, memo, actorId, token],
    },
  ]);

  if (results[0].length > 0) {
    if (results[1].length === 0) {
      // batch 안에서 UPDATE 는 성공했는데 이력이 빠지는 경우는 문장 오류다.
      throw new Error(`재고 조정 이력 INSERT 실패 (item ${itemId})`);
    }
    return { ok: true, total_qty: after };
  }

  // 0행 — 사이에 다른 관리자가 수량을 바꿨거나 가드가 거절했다. 재조회로 원인을 가른다.
  const [cur] = (await db.query(
    `SELECT total_qty, qty_repair FROM items WHERE id = ?1`,
    [itemId],
  )) as ItemQty[];
  if (!cur) return { error: "not_found" };
  if (cur.total_qty !== before) return { error: "conflict" };
  if (after < 1) return { error: "min_qty" };
  if (after < cur.qty_repair) return { error: "repair_qty_constraint" };
  return { error: "rented_qty_constraint" };
}
