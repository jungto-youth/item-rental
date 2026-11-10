// 반납 지연 다이제스트 — Cloudflare Cron Trigger 가 하루 한 번 부른다.
//
// 중복 방지: notification_log 에 그날의 키를 먼저 선점하고, 선점에 성공한 실행만
// 전송한다. 전송이 실패하면 선점을 되돌려 같은 날 재시도에서 다시 보낼 수 있게 한다.
import { getDb, SQL_NOW } from "../db";
import type { Bindings } from "../types";
import { kstToday } from "../../../shared/rental-period";
import {
  isTelegramConfigured,
  notifyOverdueDigest,
  type OverdueEntry,
} from "./telegram.service";

// 한 메시지에 담는 최대 건수 — 넘으면 "외 N건"으로 줄인다.
const MAX_ENTRIES = 10;

type OverdueRow = {
  item_name: string;
  qty: number;
  due_at: string | null;
  member_name: string;
};

// 실패해도 throw 하지 않는다 — Cron 이 재시도 폭주하지 않게 로그만 남긴다.
export async function sendOverdueDigest(
  env: Bindings,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isTelegramConfigured(env)) return;

  try {
    const db = getDb(env);
    const [countRow] = (await db.query(
      `SELECT COUNT(*) AS count
         FROM reservations
        WHERE status = 'rented'
          AND due_at IS NOT NULL
          AND due_at < ${SQL_NOW}`,
    )) as { count: number }[];
    const total = countRow?.count ?? 0;
    if (total === 0) return;

    const rows = (await db.query(
      `SELECT COALESCE(r.item_name_snapshot, items.name) AS item_name,
              r.qty, r.due_at, members.name AS member_name
         FROM reservations r
         JOIN items ON items.id = r.item_id
         JOIN members ON members.id = r.member_id
        WHERE r.status = 'rented'
          AND r.due_at IS NOT NULL
          AND r.due_at < ${SQL_NOW}
        ORDER BY r.due_at ASC
        LIMIT ${MAX_ENTRIES}`,
    )) as OverdueRow[];

    // 그날(KST) 한 번만 보낸다. Cron 이 재시도되거나 수동 실행해도 중복되지 않는다.
    const dedupeKey = `overdue:${kstToday(now)}`;
    const claimed = (await db.query(
      `INSERT INTO notification_log (dedupe_key) VALUES (?1)
       ON CONFLICT(dedupe_key) DO NOTHING
       RETURNING dedupe_key`,
      [dedupeKey],
    )) as { dedupe_key: string }[];
    if (claimed.length === 0) return;

    const entries: OverdueEntry[] = rows.map((row) => ({
      itemName: row.item_name,
      qty: row.qty,
      memberName: row.member_name,
      dueAt: row.due_at,
    }));
    const sent = await notifyOverdueDigest(env, entries, total, fetchImpl);
    if (!sent) {
      // 전송 실패 — 다음 실행에서 다시 시도할 수 있게 선점을 되돌린다.
      await db.query(
        `DELETE FROM notification_log WHERE dedupe_key = ?1`,
        [dedupeKey],
      );
    }
  } catch (err) {
    console.error("overdue digest failed", err);
  }
}
