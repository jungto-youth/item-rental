// 재고 계산·배지 단일 출처 — server(목록·검색·상세)와 web(카드·탐색기·대여폼)이 같은 규칙을 쓴다.
// 0005 전에는 세 곳(web/src/utils/stock.ts, search.service.withAvailabilityBadge, routes/items.ts)에
// 같은 판정이 복사돼 있었고, 한쪽만 고치면 배지가 어긋났다 (이슈 #12 §7.2).
//
// 수량 축: rentable_qty = total_qty - qty_repair (수리중은 빌려줄 수 없다)
//          available    = rentable_qty - active_now (지금 빌릴 수 있는 수량)
// 생애주기: lifecycle='retired' 면 수량과 무관하게 대여 불가·폐기 표시
import type { AvailabilityBadge, ItemKind, ItemLifecycle } from "./api-types";

// Item 전체를 요구하지 않는다 — 서버 SQL 행·web 카드 모델 모두 이 최소 모양을 만족한다.
export type StockLike = {
  kind?: ItemKind;
  lifecycle: ItemLifecycle;
  total_qty: number;
  qty_repair?: number;
  rentable_qty?: number;
  active_now?: number;
};

// 대여 가능 기준 수량 (수리중 제외)
export function rentableQty(it: StockLike): number {
  return it.rentable_qty ?? (it.total_qty - (it.qty_repair ?? 0));
}

// 지금 빌릴 수 있는 수량
export function availableQty(it: StockLike): number {
  return Math.max(0, rentableQty(it) - (it.active_now ?? 0));
}

// 대여 가능 여부 — 소모품은 대여 대상이 아니라 항상 true(필터에서 제외하지 않음)
export function isItemAvailable(it: StockLike): boolean {
  if (it.kind === "consumable") return true;
  if (it.lifecycle !== "active") return false;
  return availableQty(it) > 0;
}

// 카드·행 배지 — 우선순위: 폐기 > 소모품 > 수리중 > 대여중 > 대여가능.
// (폐기를 소모품보다 먼저 — 관리자 목록에서 폐기 소모품이 "소모품"으로 보여
// 대시보드 그룹(폐기)과 어긋나던 버그 수정. 공개 목록엔 폐기가 안 내려와 영향 없음)
export function badgeFor(it: StockLike): {
  kind: "retired" | "neutral" | "repair" | "rented" | "available";
  label: string;
} {
  if (it.lifecycle === "retired") return { kind: "retired", label: "폐기" };
  if (it.kind === "consumable") return { kind: "neutral", label: "소모품" };
  // 수리중은 수량 축이다 — 빌려줄 수 있는 수량이 0 이면 전부 수리중이다.
  // rentable_qty 를 우선 읽는다(서버가 계산해 내려준 값) — 없으면 total_qty - qty_repair.
  if (rentableQty(it) <= 0) {
    return { kind: "repair", label: "수리중" };
  }
  const available = availableQty(it);
  if (available === 0) return { kind: "rented", label: "대여 중" };
  if (rentableQty(it) > 1) return { kind: "available", label: `${available}개 가능` };
  return { kind: "available", label: "대여 가능" };
}

// API 가 내리는 가용 배지 — 소모품은 대여 대상이 아니라 null(배지를 그리지 않음).
// 목록·검색·상세가 모두 이 함수를 쓴다.
export function availabilityBadgeOf(it: StockLike): AvailabilityBadge | null {
  const { kind } = badgeFor(it);
  return kind === "neutral" ? null : kind;
}

// 상태 그룹 — 관리자 칩 필터용. badgeFor와 같은 우선순위를 쓴다.
export type StockGroup =
  | "rented"
  | "repair"
  | "available"
  | "consumable"
  | "retired";

export function groupKey(it: StockLike): StockGroup {
  if (it.lifecycle === "retired") return "retired";
  if (it.kind === "consumable") return "consumable";
  if (rentableQty(it) <= 0) return "repair";
  if ((it.active_now ?? 0) > 0) return "rented";
  return "available";
}
