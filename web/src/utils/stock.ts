// 재고 계산·배지 — 실제 구현은 server·web 공유 모듈(shared/stock.ts)에 있다.
// 이 재-export 로 web 소비 파일들의 import 경로가 유지된다.
export {
  availableQty,
  availabilityBadgeOf,
  badgeFor,
  groupKey,
  isItemAvailable,
  rentableQty,
} from "../../../shared/stock";
export type { StockGroup, StockLike } from "../../../shared/stock";

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
