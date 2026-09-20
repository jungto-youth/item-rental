// 현황 서비스 — 물품별 현재 상태 (관리자 /admin 물품 현황 화면)
//
// 예약 건수나 대여 처리 목록 대신, 전체 물품(폐기 포함)을 한 번에 내려줘서
// 화면에서 상태(대여 중/점검·수리/가용/소모품/폐기)별로 그룹핑한다.
// 현재 대여자는 별도 쿼리로 뽑아 물품별로 묶는다.
import type { Sql } from "../db";

export type DashboardRenter = {
  member_name: string;
  member_phone: string | null;
  qty: number;
};

export type DashboardItem = {
  id: number;
  name: string;
  kind: string; // items.kind: rental | consumable
  status: string; // items.status: active | repair | retired
  total_qty: number;
  qty_broken: number;
  rentable_qty: number;
  active_now: number;
  photo: string | null;
  current_renters: DashboardRenter[];
};

export async function getDashboard(db: Sql) {
  // Q1 전체 물품(폐기 포함) + Q2 현재 대여자 — neon HTTP 드라이버는 쿼리당 1 request라 병렬 실행
  const [itemsRaw, rentersRaw] = await Promise.all([
    db.query(
      `SELECT items.id, items.name, items.kind, items.status, items.total_qty, items.qty_broken,
              (items.total_qty - items.qty_broken) AS rentable_qty,
              (SELECT '/api/photos/' || p.r2_key FROM item_photos p
                WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS photo,
              (SELECT COALESCE(SUM(r.qty), 0)::int FROM reservations r
                WHERE r.item_id = items.id AND r.status = 'rented') AS active_now
         FROM items ORDER BY items.id DESC`,
    ),
    db.query(
      `SELECT r.item_id, m.name AS member_name, m.phone AS member_phone, r.qty
         FROM reservations r
         JOIN members m ON m.id = r.member_id
        WHERE r.status = 'rented'
        ORDER BY r.item_id, r.created_at, r.id`,
    ),
  ]);

  // SAFETY: 각 raw 쿼리의 SELECT 목록이 아래 타입과 일치한다. neon HTTP 드라이버의
  // 반환형이 유니온이라 단언이 필요한데, tsc는 SELECT 문자열을 읽지 못해 이 일치를 검사할 수 없다.
  const items = itemsRaw as unknown as Omit<DashboardItem, "current_renters">[];
  // SAFETY: rentersRaw 도 같은 이유 — Q2 SELECT(member_name·member_phone·qty·item_id)와 타입 일치
  const renters = rentersRaw as unknown as (DashboardRenter & { item_id: number })[];

  // 현재 대여자를 물품별로 묶는다
  const byItem = new Map<number, DashboardRenter[]>();
  for (const r of renters) {
    const list = byItem.get(r.item_id);
    if (list) {
      list.push({ member_name: r.member_name, member_phone: r.member_phone, qty: r.qty });
    } else {
      byItem.set(r.item_id, [{ member_name: r.member_name, member_phone: r.member_phone, qty: r.qty }]);
    }
  }

  return {
    items: items.map((it) => ({ ...it, current_renters: byItem.get(it.id) ?? [] })),
  };
}