// 반납 예정일 계산 — KST 경계와 UTC 저장 형식을 고정한다.
// 웹의 기본값·최소/최대 입력과 서버의 검증·저장이 같은 값을 쓰는 근거다.
import { test, expect } from "vitest";
import {
  DEFAULT_RENTAL_DAYS,
  MAX_RENTAL_DAYS,
  addDaysIso,
  defaultDueAtIso,
  defaultDueDateKst,
  dueAtFromKstDate,
  isDueDateInRange,
  isIsoDate,
  kstToday,
  maxDueDateKst,
  minDueDateKst,
} from "../../shared/rental-period.ts";

test("kstToday: UTC 15:00 이 KST 자정 경계다", () => {
  expect(kstToday(new Date("2026-11-03T14:59:59.999Z"))).toBe("2026-11-03");
  expect(kstToday(new Date("2026-11-03T15:00:00.000Z"))).toBe("2026-11-04");
});

test("기본값·범위: 기본 7일, 내일부터 30일", () => {
  const now = new Date("2026-11-03T00:00:00.000Z"); // KST 11-03 09:00
  expect(DEFAULT_RENTAL_DAYS).toBe(7);
  expect(MAX_RENTAL_DAYS).toBe(30);
  expect(defaultDueDateKst(now)).toBe("2026-11-10");
  expect(minDueDateKst(now)).toBe("2026-11-04");
  expect(maxDueDateKst(now)).toBe("2026-12-03");
});

test("isDueDateInRange: 오늘은 안 되고 내일~30일만 통과한다", () => {
  const now = new Date("2026-11-03T00:00:00.000Z");
  expect(isDueDateInRange("2026-11-03", now)).toBe(false);
  expect(isDueDateInRange("2026-11-04", now)).toBe(true);
  expect(isDueDateInRange("2026-12-03", now)).toBe(true);
  expect(isDueDateInRange("2026-12-04", now)).toBe(false);
  expect(isDueDateInRange("2026-02-30", now)).toBe(false);
});

test("dueAtFromKstDate: KST 그날의 끝을 UTC ISO 로 저장한다", () => {
  expect(dueAtFromKstDate("2026-11-10")).toBe("2026-11-10T14:59:59.999Z");
  expect(dueAtFromKstDate("2026-02-29")).toBeNull(); // 2026은 윤년이 아니다
  expect(dueAtFromKstDate("2024-02-29")).toBe("2024-02-29T14:59:59.999Z");
});

test("addDaysIso: 월·연 경계를 넘긴다", () => {
  expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
  expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  expect(isIsoDate("2027-01-02")).toBe(true);
});

test("defaultDueAtIso: due_date 생략 시 기본 7일 뒤 KST 끝", () => {
  expect(defaultDueAtIso(new Date("2026-11-03T00:00:00.000Z"))).toBe(
    "2026-11-10T14:59:59.999Z",
  );
});
