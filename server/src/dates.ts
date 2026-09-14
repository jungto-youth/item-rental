// SPEC §3 — '오늘'과 연체 판정은 KST 자정 기준이다. 서버(Wokers)·DB(PostgreSQL)는 UTC라
// CURRENT_DATE(=UTC 자정)를 그대로 쓰면 KST 오전 9시까지 하루 어긋난다(대시보드 '오늘 수령/반납'
// 목록이 새벽에 어제 기준으로 뜨다). 예약 날짜(start_date/end_date)는 전부 KST 달력 날짜로 저장되므로
// '오늘'도 KST여야 비교가 맞다.

// SQL용 — now() AT TIME ZONE 'Asia/Seoul' 는 KST 벽시각(timestamp without tz)을 주고
// ::date 가 그 날짜를 준다
export const KST_TODAY = "(now() AT TIME ZONE 'Asia/Seoul')::date";

// JS용 (past_date 검사 등) — UTC 기준 서버에서 KST 오늘 날짜 (YYYY-MM-DD)
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
