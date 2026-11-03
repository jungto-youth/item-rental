// timestamptz ISO 문자열 → KST 달력 날짜(YYYY-MM-DD).
export function fmtKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}
