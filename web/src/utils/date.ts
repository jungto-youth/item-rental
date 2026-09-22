// timestamptz ISO 문자열 → KST 달력 날짜(YYYY-MM-DD).
// iso.slice(0,10) 은 UTC 날짜라 00:00~09:00 KST 사이 대여가 하루 전으로 표시되므로 사용 금지.
// en-CA 로캘이 YYYY-MM-DD 를 내주는 성질을 이용한다.
export function fmtKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

// YYYY-MM-DD 문자열 유틸 — Date.parse('2025-11-08')은 UTC 자정으로 풀려
// 음수 오프셋 시간대에서 하루 밀린다. 항상 로컬 시각으로 조립한다.
export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return fmtLocal(new Date(y, m - 1, d + n));
}
/** 반개구간 [start, end) 일수 — 반납일은 사용일이 아니다 */
export function diffDays(start: string, end: string): number {
  return Math.round(
    (parseISO(end).getTime() - parseISO(start).getTime()) / 86400000,
  );
}
/** 05-12 형태 짧은 표기 — 스트립 눈금용 */
export function fmtShort(s: string): string {
  return s.slice(5).replace("-", ".");
}
export function todayISO(): string {
  return fmtLocal(new Date());
}
