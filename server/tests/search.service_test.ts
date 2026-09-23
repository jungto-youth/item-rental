// 검색 서비스 순수 로직 테스트 — 가용 배지 계산 + RRF 융합 + FTS5 구문 생성
import { assertEquals } from "@std/assert";
import {
  ftsQuery,
  fuseRRF,
  splitKeywordTokens,
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

// ===== fuseRRF (bm25·LIKE·코사인 순위 융합) =====

Deno.test("fuseRRF: 양쪽 목록에 모두 나온 물품이 점수 합산으로 1위가 된다", () => {
  // 키워드: 1이 1위, 2가 2위 / 의미: 3이 1위, 1이 2위 — 1만 양쪽에 등장
  // 1 = 1/61 + 1/62 ≈ 0.0325 > 3 = 1/61 ≈ 0.0164 > 2 = 1/62 ≈ 0.0161
  const fused = fuseRRF([[1, 2], [3, 1]]);
  assertEquals(fused, [1, 3, 2]);
});

Deno.test("fuseRRF: 각 목록 1위끼리 동률이면 id DESC (홈 목록 정렬과 통일)", () => {
  // 각 목록의 1위는 점수가 같다(1/61) — 더 큰 id가 먼저
  const fused = fuseRRF([[10], [5]]);
  assertEquals(fused, [10, 5]);
});

Deno.test("fuseRRF: 한쪽 목록이 비어도 다른쪽 순위를 유지한다", () => {
  const fused = fuseRRF([[], [7, 3]]);
  assertEquals(fused, [7, 3]);
  assertEquals(fuseRRF([[], []]).length, 0);
});

Deno.test("fuseRRF: 중복 id는 하나만 남는다", () => {
  const fused = fuseRRF([[4], [4]]);
  assertEquals(fused, [4]);
});

Deno.test("fuseRRF: 세 목록(FTS·LIKE·의미)을 융합한다 — 3중 등장이 최상위", () => {
  // 5는 세 목록 모두 1위: 3/61 ≈ 0.0492 > 1 = 2/62 ≈ 0.0323 > 7 = 1/62 ≈ 0.0161 > 2 = 1/63
  const fused = fuseRRF([[5, 1, 2], [5, 7], [5, 1]]);
  assertEquals(fused, [5, 1, 7, 2]);
});

// ===== splitKeywordTokens (trigram 3글자 경계) =====

Deno.test("splitKeywordTokens: 1-2글자는 LIKE 폴백, 3글자 이상은 FTS로 간다", () => {
  // 텐트·매트 같은 짧은 단어가 실제로 흔하다 — trigram이 만들 수 없는 토큰이다
  const { long, short } = splitKeywordTokens(["점프로프", "텐트", "운동", "매트", "abc"]);
  assertEquals(long, ["점프로프", "abc"]);
  assertEquals(short, ["텐트", "운동", "매트"]);
});

// ===== ftsQuery (FTS5 구문 주입 차단) =====

Deno.test("ftsQuery: 토큰을 큰따옴표로 감싸 AND로 연결한다", () => {
  assertEquals(ftsQuery(["점프로프", "운동기구"]), '"점프로프" AND "운동기구"');
});

Deno.test("ftsQuery: 내부 따옴표는 이중화한다", () => {
  // " → "" — MATCH 구문이 깨지지 않게 (§11 리스크: FTS5 MATCH 구문 주입)
  assertEquals(ftsQuery(['a"b']), '"a""b"');
});

Deno.test("ftsQuery: AND·NEAR 같은 예약어도 따옴표 안이면 검색어다", () => {
  assertEquals(ftsQuery(["NOT", "NEAR"]), '"NOT" AND "NEAR"');
});
