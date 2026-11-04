// 재고 계산·배지 단일 출처 — server(목록·검색·상세)와 web(카드·탐색기·대여폼)이 같은 규칙을 쓴다.
// 0005 전에는 세 곳(web/src/utils/stock.ts, search.service.withAvailabilityBadge, routes/items.ts)에
// 같은 판정이 복사돼 있었고, 한쪽만 고치면 배지가 어긋났다 (이슈 #12 §7.2).
//
// 0012 부터 재고는 세 영역이다.
//   rented   = active_now   실제 대여 중        — 점유
//   pending  = pending_qty  승인 대기, 배정 완료 — 점유
//   reserved = reserved_qty 반납을 기다리는 예약 — 미점유
//
//   rentable_qty = total_qty - qty_repair (수리중은 빌려줄 수 없다)
//   free         = rentable_qty - rented - pending
//   newCap       = free - reserved          (신규가 지금 받을 수 있는 양)
//   queueCap     = rentable_qty - reserved  (신규가 예약할 수 있는 양)
//
// 생애주기: lifecycle='retired' 면 수량과 무관하게 대여 불가·폐기 표시
import type { AvailabilityBadge, CatalogSummary, ItemKind, ItemLifecycle } from "./api-types";

// Item 전체를 요구하지 않는다 — 서버 SQL 행·web 카드 모델 모두 이 최소 모양을 만족한다.
export type StockLike = {
  kind?: ItemKind;
  lifecycle: ItemLifecycle;
  total_qty: number;
  qty_repair?: number;
  rentable_qty?: number;
  // rented — 서버는 계속 active_now 라는 이름으로 내려준다
  active_now?: number;
  pending_qty?: number;
  reserved_qty?: number;
};

// 대여 가능 기준 수량 (수리중 제외)
export function rentableQty(it: StockLike): number {
  return it.rentable_qty ?? (it.total_qty - (it.qty_repair ?? 0));
}

export function rentedQty(it: StockLike): number {
  return it.active_now ?? 0;
}

export function pendingQty(it: StockLike): number {
  return it.pending_qty ?? 0;
}

export function reservedQty(it: StockLike): number {
  return it.reserved_qty ?? 0;
}

// 물리적으로 비어 있는 수량 (예약 대기열이 아직 가져가지 않은 몫 포함)
export function freeQty(it: StockLike): number {
  return Math.max(0, rentableQty(it) - rentedQty(it) - pendingQty(it));
}

// 신규가 지금 받을 수 있는 수량 — 대기열에 우선권을 남겨 둔다
export function availableQty(it: StockLike): number {
  return Math.max(0, freeQty(it) - reservedQty(it));
}

// 신규가 예약할 수 있는 남은 자리
export function queueCapacity(it: StockLike): number {
  return Math.max(0, rentableQty(it) - reservedQty(it));
}

// 한 번에 신청할 수 있는 최대 수량 (서버의 maxReq 와 같은 식)
export function maxRequestQty(it: StockLike): number {
  if (it.lifecycle !== "active" || it.kind === "consumable") return 0;
  return Math.min(rentableQty(it), availableQty(it) + queueCapacity(it));
}

// 카드·행 배지 — 우선순위:
//   폐기 > 소모품 > 수리중 > 신청 마감(unavailable) > 예약 가능(reserved) > 대여 가능(available)
// (폐기를 소모품보다 먼저 — 관리자 목록에서 폐기 소모품이 "소모품"으로 보여
// 대시보드 그룹(폐기)과 어긋나던 버그 수정. 공개 목록엔 폐기가 안 내려와 영향 없음)
export function badgeFor(it: StockLike): {
  kind:
    | "retired"
    | "neutral"
    | "repair"
    | "unavailable"
    | "reserved"
    | "available";
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
  if (available > 0) {
    return {
      kind: "available",
      label: rentableQty(it) > 1 ? `${available}개 가능` : "대여 가능",
    };
  }
  // 지금은 없지만 반납을 기다리는 예약을 받을 수 있다
  const queue = queueCapacity(it);
  if (queue > 0) {
    return {
      kind: "reserved",
      label: rentableQty(it) > 1 ? `예약 가능 ${queue}개` : "예약 가능",
    };
  }
  return { kind: "unavailable", label: "신청 마감" };
}

// API 가 내리는 가용 배지 — 소모품은 대여 대상이 아니라 null(배지를 그리지 않음).
// 목록·검색·상세가 모두 이 함수를 쓴다.
export function availabilityBadgeOf(it: StockLike): AvailabilityBadge | null {
  const { kind } = badgeFor(it);
  return kind === "neutral" ? null : kind;
}

// 목록 상태 칸의 구성 요소 — 이슈 #12 §6.2/§6.4.
// 첫 조각은 '지금 무엇을 할 수 있는가'다: 대여 가능 N / 예약 가능 N / 신청 마감.
// 이어서 '대여 중 N · 수리 중 N' 을 붙인다. 화면이 구분점·색을 소유한다.
// 수량 0 인 항은 숨기고, 폐기·소모품은 수량 분포가 아니라 단일 라벨이다.
export type StatusPartKey =
  | "available"
  | "reserved"
  | "unavailable"
  | "rented"
  | "repair"
  | "consumable"
  | "retired";
export type StatusPart = { key: StatusPartKey; label: string };

export function statusParts(it: StockLike): StatusPart[] {
  if (it.lifecycle === "retired") return [{ key: "retired", label: "폐기" }];
  if (it.kind === "consumable") {
    return [{ key: "consumable", label: `보유 ${it.total_qty}` }];
  }
  const available = availableQty(it);
  const rented = rentedQty(it);
  const repair = it.qty_repair ?? 0;
  const parts: StatusPart[] = [];
  if (available > 0) {
    parts.push({ key: "available", label: `대여 가능 ${available}` });
  } else {
    const queue = queueCapacity(it);
    if (queue > 0) parts.push({ key: "reserved", label: `예약 가능 ${queue}` });
    else if (rentableQty(it) > 0) parts.push({ key: "unavailable", label: "신청 마감" });
  }
  if (rented > 0) parts.push({ key: "rented", label: `대여 중 ${rented}` });
  if (repair > 0) parts.push({ key: "repair", label: `수리 중 ${repair}` });
  return parts;
}

// 목록 상단 요약 — 서버 집계(listItems.summary)와 같은 규칙을 클라이언트에서 계산한다.
// 모두 '종류 수'다: 대여 가능 = 대여품 중 신규가 지금 받을 수 있는 종류,
// 대여 중 = 실제 대여 중(rented) 종류, 수리 중 = 수리 수량이 있는 종류.
// 폐기 종류는 어느 값에도 넣지 않는다. 예약 대기만 있는 종류는 '대여 가능'에 넣지 않는다.
export function catalogSummary(items: StockLike[]): CatalogSummary {
  let types = 0;
  let available = 0;
  let rented = 0;
  let repair = 0;
  for (const it of items) {
    if (it.lifecycle === "retired") continue;
    types += 1;
    if ((it.active_now ?? 0) > 0) rented += 1;
    if ((it.qty_repair ?? 0) > 0) repair += 1;
    // 소모품은 '대여' 대상이 아니다 — 대여 가능 종류에서 뺀다
    if (it.kind !== "consumable" && availableQty(it) > 0) available += 1;
  }
  return { types, available, rented, repair };
}
