// 장바구니 — 회원이 목록에서 담은 물품 줄. 서버에 저장하지 않고 브라우저에 둔다.
//
// 담는 순간의 재고는 잡지 않는다. 장바구니는 '신청 전 메모'이고, 실제 재고 검사는
// 제출할 때 서버가 물품마다 다시 한다. 그래서 여기서는 표시·수량 조절만 맡는다.
//
// 저장 키는 회원 id 별로 나눈다 — 같은 브라우저에서 계정을 바꿔도 장바구니가 섞이지 않는다.
import { createSignal } from "solid-js";
import type { Item } from "../types";
import { MAX_CART_LINES } from "../../../shared/cart";
import { maxRequestQty } from "../utils/stock";

export type CartLine = { itemId: number; qty: number };

const STORAGE_PREFIX = "item-rental:cart:v1:";

const [lines, setLines] = createSignal<CartLine[]>([]);
const [owner, setOwner] = createSignal<string | null>(null);

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

// 저장된 값은 사용자가 직접 고칠 수 있는 문자열이다 — 모양을 다시 검증한다.
function readLines(userId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<number>();
    const out: CartLine[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const { itemId, qty } = value as { itemId?: unknown; qty?: unknown };
      if (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId < 1) {
        continue;
      }
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) continue;
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      out.push({ itemId, qty });
      if (out.length >= MAX_CART_LINES) break;
    }
    return out;
  } catch {
    // 저장소를 못 읽어도 장바구니는 빈 상태로 동작해야 한다.
    return [];
  }
}

function commit(next: CartLine[]) {
  const userId = owner();
  setLines(next);

  // 로그아웃 상태에서는 메모리에만 둔다 — 다음 로그인에서 계정 키로 다시 읽는다.
  if (!userId) return;
  try {
    if (next.length === 0) localStorage.removeItem(storageKey(userId));
    else localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // 저장 공간이 없거나 막혀도 이번 세션의 장바구니는 유지한다.
  }
}

export const cart = {
  lines,
  count: () => lines().length,
  totalQty: () => lines().reduce((sum, line) => sum + line.qty, 0),
  qtyOf: (itemId: number) =>
    lines().find((line) => line.itemId === itemId)?.qty ?? 0,

  // 로그인한 회원이 바뀔 때만 저장소와 맞춘다. 같은 회원이면 화면 상태를 건드리지 않는다.
  syncToUser(userId: string | null) {
    if (owner() === userId) return;
    setOwner(userId);
    setLines(userId ? readLines(userId) : []);
  },

  // 담기 — 이미 담긴 물품이면 1개 더한다. 상한(현재 신청 가능 수량)에 닿으면 false.
  add(item: Item): boolean {
    const max = maxRequestQty(item);
    if (max <= 0) return false;

    const current = lines();
    const existing = current.find((line) => line.itemId === item.id);
    if (existing) {
      if (existing.qty >= max) return false;
      commit(
        current.map((line) =>
          line.itemId === item.id
            ? { ...line, qty: Math.min(line.qty + 1, max) }
            : line,
        ),
      );
      return true;
    }

    if (current.length >= MAX_CART_LINES) return false;
    commit([...current, { itemId: item.id, qty: 1 }]);
    return true;
  },

  setQty(itemId: number, qty: number) {
    const next = Math.max(1, Math.trunc(qty));
    commit(
      lines().map((line) =>
        line.itemId === itemId ? { ...line, qty: next } : line,
      ),
    );
  },

  remove(itemId: number) {
    commit(lines().filter((line) => line.itemId !== itemId));
  },

  removeMany(itemIds: number[]) {
    if (itemIds.length === 0) return;
    const remove = new Set(itemIds);
    commit(lines().filter((line) => !remove.has(line.itemId)));
  },

  clear() {
    commit([]);
  },
};
