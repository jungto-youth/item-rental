import type { Item } from "../types";

// 재고 계산 단일 출처 — item-card·item-explorer·item-rental-form에 복사돼 있던
// rentable/available 계산을 여기로 모았다. 셋 중 하나를 고치면 셋 다 바뀐다.

type StockLike = Pick<
  Item,
  "kind" | "status" | "total_qty" | "qty_broken" | "rentable_qty" | "active_now"
>;

// 대여 가능 기준 수량 (수리중 제외)
export function rentableQty(it: StockLike): number {
  return it.rentable_qty ?? (it.total_qty - (it.qty_broken ?? 0));
}

// 지금 빌릴 수 있는 수량
export function availableQty(it: StockLike): number {
  return Math.max(0, rentableQty(it) - (it.active_now ?? 0));
}

// 대여 가능 여부 — 소모품은 대여 대상이 아니라 항상 true(필터에서 제외하지 않음)
export function isItemAvailable(it: StockLike): boolean {
  if (it.kind === "consumable") return true;
  if (it.status !== "active") return false;
  return availableQty(it) > 0;
}

// 카드·행 배지 — 우선순위: 폐기 > 소모품 > 수리중 > 대여중 > 대여가능.
// (폐기를 소모품보다 먼저 — 관리자 목록에서 폐기 소모품이 "소모품"으로 보여
// 대시보드 그룹(폐기)과 어긋나던 버그 수정. 공개 목록엔 폐기가 안 내려와 영향 없음)
export function badgeFor(it: StockLike): { kind: string; label: string } {
  if (it.status === "retired") return { kind: "retired", label: "폐기" };
  if (it.kind === "consumable") return { kind: "neutral", label: "소모품" };
  if (it.status !== "active" || (it.qty_broken ?? 0) >= it.total_qty) {
    return { kind: "repair", label: "수리중" };
  }
  const available = availableQty(it);
  if (available === 0) return { kind: "rented", label: "대여 중" };
  if (rentableQty(it) > 1) return { kind: "available", label: `${available}개 가능` };
  return { kind: "available", label: "대여 가능" };
}

// 상태 그룹 — 관리자 칩 필터용. badgeFor와 같은 우선순위를 쓴다.
export type StockGroup = "rented" | "repair" | "available" | "consumable" | "retired";

export function groupKey(it: StockLike): StockGroup {
  if (it.status === "retired") return "retired";
  if (it.kind === "consumable") return "consumable";
  if (it.status === "repair" || (it.qty_broken ?? 0) >= it.total_qty) return "repair";
  if ((it.active_now ?? 0) > 0) return "rented";
  return "available";
}

// 깨진 이미지는 빈 상자 대신 물품 아이콘으로 — display:none만 하면
// 회색 빈 상자만 남아 "이미지 없음"과 구분되지 않는다
export function handleImgFallback(e: Event): void {
  const img = e.target as HTMLImageElement;
  const parent = img.parentElement;
  if (!parent) return;
  img.remove();
  const ph = document.createElement("span");
  ph.setAttribute("aria-hidden", "true");
  ph.textContent = "📦";
  parent.append(ph);
}
