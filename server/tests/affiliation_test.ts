import { test, expect } from "vitest";
import {
  AFFILIATION_GROUPS,
  BRANCHES,
  formatAffiliation,
  groupsOf,
  isAffiliationValid,
  isValidAffiliationPair,
  parseAffiliation,
} from "../../shared/affiliation.ts";

test("affiliation: 지회별 모둠 목록을 고정한다", () => {
  expect(BRANCHES).toEqual(["서울", "경기", "남부"]);
  expect(AFFILIATION_GROUPS.서울).toEqual(["동부", "서부", "남부", "북부"]);
  expect(AFFILIATION_GROUPS.경기).toEqual(["동부", "서부", "남부", "북부"]);
  expect(AFFILIATION_GROUPS.남부).toEqual(["충청", "대전/광주", "대구/경북", "부산/경남"]);
  expect(groupsOf("없는지회")).toEqual([]);
});

test("affiliation: 저장 문자열과 조합 검증이 서로 맞물린다", () => {
  expect(formatAffiliation("서울", "동부")).toBe("서울 · 동부");
  expect(isValidAffiliationPair("서울", "동부")).toBe(true);
  // 지회가 다르면 같은 이름의 모둠도 허용하지 않는다
  expect(isValidAffiliationPair("서울", "충청")).toBe(false);
  expect(isValidAffiliationPair("남부", "충청")).toBe(true);

  expect(isAffiliationValid("서울 · 동부")).toBe(true);
  expect(isAffiliationValid("서울지부")).toBe(false);
  expect(isAffiliationValid(null)).toBe(false);
  expect(isAffiliationValid("서울 · 동부 · 남부")).toBe(false);

  expect(parseAffiliation("남부 · 충청")).toEqual({ branch: "남부", group: "충청" });
  expect(parseAffiliation("서울지부")).toEqual({ branch: "", group: "" });
});

test("affiliation: 예전 '지회' 표기도 현재 이름으로 읽는다", () => {
  // 0010 이전에 저장된 값 — 마이그레이션 전에도 가드가 막지 않게 정규화한다
  expect(isAffiliationValid("서울지회 · 동부")).toBe(true);
  expect(parseAffiliation("남부지회 · 충청")).toEqual({ branch: "남부", group: "충청" });
  expect(formatAffiliation("서울지회", "동부")).toBe("서울 · 동부");
});
