// 검색 서비스 순수 로직 테스트 — 가용 배지 계산
import { assertEquals } from "@std/assert";
import { withAvailabilityBadge, type ListItemWithBadge } from "../src/services/search.service.ts";
import type { ListItemRow } from "../src/services/items.service.ts";

function row(overrides: Partial<ListItemRow> = {}): ListItemRow {
  return {
    id: 1,
    name: "텐트",
    description: null,
    total_qty: 2,
    status: "active",
    kind: "rental",
    location: null,
    qty_broken: 0,
    rentable_qty: 2,
    active_now: 0,
    photos: [],
    ...overrides,
  } as ListItemRow;
}

const cases: Array<[Partial<ListItemRow>, ListItemWithBadge["availability_badge"]]> = [
  [{}, "available"],
  [{ active_now: 1, rentable_qty: 2 }, "available"],
  [{ active_now: 2, rentable_qty: 2 }, "rented"],
  [{ status: "repair", rentable_qty: 2 }, "repair"],
  [{ rentable_qty: 0 }, "repair"],
  [{ qty_broken: 2, rentable_qty: 0 }, "repair"],
  [{ kind: "consumable" }, null],
];

for (const [overrides, expected] of cases) {
  Deno.test(`withAvailabilityBadge: ${JSON.stringify(overrides)} → ${expected}`, () => {
    assertEquals(withAvailabilityBadge(row(overrides)).availability_badge, expected);
  });
}
