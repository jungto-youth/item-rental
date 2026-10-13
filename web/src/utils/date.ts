// timestamptz ISO 문자열 → KST 달력 날짜(YYYY-MM-DD).
// iso.slice(0,10) 은 UTC 날짜라 00:00~09:00 KST 사이 대여가 하루 전으로 표시되므로 사용 금지.
// en-CA 로캘이 YYYY-MM-DD 를 내주는 성질을 이용한다.
export function fmtKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}
