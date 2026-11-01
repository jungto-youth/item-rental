// 재고 계산 — 실제 구현은 server·web 공유 모듈(shared/stock.ts)에 있다.
// web 이 실제로 쓰는 함수만 다시 내보낸다 (전체 재수출은 쓰지 않는 API까지 노출한다).
export { availableQty, catalogSummary, statusParts } from "../../../shared/stock";
export type { StatusPart, StatusPartKey, StockLike } from "../../../shared/stock";
