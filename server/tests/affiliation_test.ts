import { test, expect } from "vitest";
import {
  AFFILIATION_GROUPS,
  AFFILIATION_PART_MAX,
  BRANCHES,
  DIVISIONS,
  customPartIssue,
  formatAffiliation,
  groupsOf,
  isAffiliationValid,
  isDivision,
  isValidAffiliation,
  isValidAffiliationPair,
  parseAffiliation,
} from "../../shared/affiliation.ts";

test("affiliation: 지부와 지회별 모둠 목록을 고정한다", () => {
  expect(DIVISIONS).toEqual(["청년지부", "대중지부"]);
  expect(BRANCHES).toEqual(["서울", "경기", "남부"]);
  expect(AFFILIATION_GROUPS.서울).toEqual(["동부", "서부", "남부", "북부"]);
  expect(AFFILIATION_GROUPS.경기).toEqual(["동부", "서부", "남부", "북부"]);
  expect(AFFILIATION_GROUPS.남부).toEqual(["충청", "대전/광주", "대구/경북", "부산/경남"]);
  expect(groupsOf("없는지회")).toEqual([]);
  expect(isDivision("청년지부")).toBe(true);
  expect(isDivision("대중지부")).toBe(true);
  expect(isDivision("기타")).toBe(false);
});

test("affiliation: 청년지부는 고정 조합만 허용한다", () => {
  expect(isValidAffiliation("청년지부", "서울", "동부")).toBe(true);
  expect(isValidAffiliation("청년지부", "남부", "부산/경남")).toBe(true);
  // 지회가 다르면 같은 이름의 모둠도 허용하지 않는다
  expect(isValidAffiliation("청년지부", "서울", "충청")).toBe(false);
  expect(isValidAffiliation("청년지부", "부산", "동부")).toBe(false);
  expect(isValidAffiliation("", "서울", "동부")).toBe(false);
});

test("affiliation: 대중지부는 지회·모둠을 자유 입력한다", () => {
  expect(isValidAffiliation("대중지부", "부산", "해운대")).toBe(true);
  expect(isValidAffiliation("대중지부", " 서울 ", " 동부 ")).toBe(true);
  expect(isValidAffiliation("대중지부", "", "동부")).toBe(false);
  expect(isValidAffiliation("대중지부", "서울", "")).toBe(false);
  expect(
    isValidAffiliation("대중지부", "가".repeat(AFFILIATION_PART_MAX), "동부"),
  ).toBe(true);
  expect(
    isValidAffiliation("대중지부", "가".repeat(AFFILIATION_PART_MAX + 1), "동부"),
  ).toBe(false);
  // 저장 구분자와 줄바꿈은 3단 파싱을 깨뜨리므로 막는다
  expect(isValidAffiliation("대중지부", "서울 · 동부", "모둠")).toBe(false);
  expect(isValidAffiliation("대중지부", "서울\n동부", "모둠")).toBe(false);
});

test("affiliation: customPartIssue가 사유를 구분한다", () => {
  expect(customPartIssue("")).toBe("required");
  expect(customPartIssue("   ")).toBe("required");
  expect(customPartIssue("가".repeat(AFFILIATION_PART_MAX + 1))).toBe("too_long");
  expect(customPartIssue("서울 · 동부")).toBe("separator");
  expect(customPartIssue("서울\n동부")).toBe("invalid");
  expect(customPartIssue("서울")).toBeNull();
});

test("affiliation: 저장 문자열과 조합 검증이 서로 맞물린다", () => {
  expect(formatAffiliation("청년지부", "서울", "동부")).toBe("청년지부 · 서울 · 동부");
  expect(formatAffiliation("대중지부", " 부산 ", " 해운대 ")).toBe("대중지부 · 부산 · 해운대");
  expect(isValidAffiliationPair("서울", "동부")).toBe(true);
  // 지회가 다르면 같은 이름의 모둠도 허용하지 않는다
  expect(isValidAffiliationPair("서울", "충청")).toBe(false);
  expect(isValidAffiliationPair("남부", "충청")).toBe(true);

  expect(isAffiliationValid("청년지부 · 서울 · 동부")).toBe(true);
  expect(isAffiliationValid("대중지부 · 부산 · 해운대")).toBe(true);
  expect(isAffiliationValid("청년지부 · 서울 · 충청")).toBe(false);
  expect(isAffiliationValid("서울지부")).toBe(false);
  expect(isAffiliationValid(null)).toBe(false);
  expect(isAffiliationValid("청년지부 · 서울 · 동부 · 남부")).toBe(false);
});

test("affiliation: 0015 이전 2단 값은 청년지부로 읽는다", () => {
  // 마이그레이션 전 값 — 배포 순서와 무관하게 가드가 막지 않게 한다
  expect(isAffiliationValid("서울 · 동부")).toBe(true);
  expect(parseAffiliation("남부 · 충청")).toEqual({
    division: "청년지부",
    branch: "남부",
    group: "충청",
  });
  expect(parseAffiliation("서울지부")).toEqual({ division: "", branch: "", group: "" });
});

test("affiliation: 예전 '지회' 표기도 현재 이름으로 읽는다", () => {
  expect(isAffiliationValid("서울지회 · 동부")).toBe(true);
  expect(isAffiliationValid("청년지부 · 서울지회 · 동부")).toBe(true);
  expect(parseAffiliation("청년지부 · 남부지회 · 충청")).toEqual({
    division: "청년지부",
    branch: "남부",
    group: "충청",
  });
  expect(formatAffiliation("청년지부", "서울지회", "동부")).toBe("청년지부 · 서울 · 동부");
});

test("affiliation: 3단 자유 입력을 복원한다", () => {
  expect(parseAffiliation("대중지부 · 부산 · 해운대")).toEqual({
    division: "대중지부",
    branch: "부산",
    group: "해운대",
  });
  expect(parseAffiliation("청년지부 · 서울 · 동부")).toEqual({
    division: "청년지부",
    branch: "서울",
    group: "동부",
  });
  expect(parseAffiliation("기타지부 · 부산 · 해운대")).toEqual({
    division: "",
    branch: "",
    group: "",
  });
  expect(parseAffiliation("대중지부 · 부산 · 해운대 · 남부")).toEqual({
    division: "",
    branch: "",
    group: "",
  });
  expect(parseAffiliation(["대중지부", "", "해운대"].join(" · "))).toEqual({
    division: "",
    branch: "",
    group: "",
  });
});
