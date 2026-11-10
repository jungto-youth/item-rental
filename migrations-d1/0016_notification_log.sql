-- 0016 — 알림 중복 방지
--
-- 반납 지연 다이제스트처럼 Cron 으로 실행되는 알림은 재시도·수동 실행으로 같은 날
-- 두 번 보낼 수 있다. 보내기 전에 키를 선점해 한 번만 나가게 한다.
-- 키는 'overdue:YYYY-MM-DD' 처럼 이벤트와 날짜를 함께 담는다.
CREATE TABLE notification_log (
  dedupe_key TEXT PRIMARY KEY,
  sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
