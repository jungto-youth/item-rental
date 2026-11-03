// 대여 기간 계산 — 서버(검증·저장)와 웹(기본값·입력 범위)이 같은 규칙을 쓴다.
//
// 날짜는 'KST 달력 날짜'(YYYY-MM-DD)로 주고받는다. DB 에는 그날의 KST 끝
// (23:59:59.999)을 UTC ISO 로 저장해 `due_at < now` 비교가 문자열 비교로도
// 성립하게 한다(SQL_NOW 와 같은 형식). 시작일은 따로 두지 않는다 — 신청/승인
// 시점이 시작이고, 사용자는 반납 예정일만 고른다.
export const DEFAULT_RENTAL_DAYS = 7;
export const MAX_RENTAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// KST 기준 오늘 — en-CA 포맷은 YYYY-MM-DD 다.
export function kstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function defaultDueDateKst(now: Date = new Date()): string {
  return addDaysIso(kstToday(now), DEFAULT_RENTAL_DAYS);
}

export function minDueDateKst(now: Date = new Date()): string {
  return addDaysIso(kstToday(now), 1);
}

export function maxDueDateKst(now: Date = new Date()): string {
  return addDaysIso(kstToday(now), MAX_RENTAL_DAYS);
}

// 반납 예정일 범위 — 내일부터 30일 이내. 문자열 비교로 충분하다(YYYY-MM-DD).
export function isDueDateInRange(date: string, now: Date = new Date()): boolean {
  if (!isIsoDate(date)) return false;
  return date >= minDueDateKst(now) && date <= maxDueDateKst(now);
}

// KST 달력 날짜의 끝을 UTC ISO 로 — 예: 2026-11-10 → 2026-11-10T14:59:59.999Z
export function dueAtFromKstDate(date: string): string | null {
  if (!isIsoDate(date)) return null;
  const start = Date.parse(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start)) return null;
  return new Date(start + DAY_MS - 1).toISOString();
}

// due_date 가 없을 때 서버가 쓰는 기본값.
export function defaultDueAtIso(now: Date = new Date()): string {
  const dueDate = defaultDueDateKst(now);
  return dueAtFromKstDate(dueDate) ?? new Date(now.getTime() + DEFAULT_RENTAL_DAYS * DAY_MS).toISOString();
}
