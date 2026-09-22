// 검색 서비스 순수 로직 테스트 — 가용 배지 계산
import { assertEquals } from "@std/assert";
import {
  fuseRRF,
  withAvailabilityBadge,
  type ListItemWithBadge,
} from "../src/services/search.service.ts";
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

// ===== fuseRRF (키워드+의미 융합) =====

Deno.test("fuseRRF: 양쪽 목록에 모두 나온 물품이 점수 합산으로 1위가 된다", () => {
  // 키워드: A 1위, B 2위 / 의미: C 1위, A 2위 — A만 양쪽에 등장
  // A = 1/61 + 1/62 ≈ 0.0325 > C = 1/61 ≈ 0.0164 > B = 1/62 ≈ 0.0161
  const fused = fuseRRF([row({ id: 1 }), row({ id: 2 })], [row({ id: 3 }), row({ id: 1 })]);
  assertEquals(fused.map((r) => r.id), [1, 3, 2]);
});

Deno.test("fuseRRF: 각 목록 1위끼리 동률이면 id DESC (홈 목록 정렬과 통일)", () => {
  // 각 목록의 1위는 점수가 같다(1/61) — 더 큰 id가 먼저
  const fused = fuseRRF([row({ id: 10 })], [row({ id: 5 })]);
  assertEquals(fused.map((r) => r.id), [10, 5]);
});

Deno.test("fuseRRF: 한쪽 목록이 비어도 다른쪽 순위를 유지한다", () => {
  const fused = fuseRRF([], [row({ id: 7 }), row({ id: 3 })]);
  assertEquals(fused.map((r) => r.id), [7, 3]);
  assertEquals(fuseRRF([], []).length, 0);
});

Deno.test("fuseRRF: 중복 id는 하나만 남는다", () => {
  const fused = fuseRRF([row({ id: 4 })], [row({ id: 4 })]);
  assertEquals(fused.length, 1);
});
