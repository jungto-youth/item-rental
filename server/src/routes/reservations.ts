import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { requireApproved } from "../middleware/auth";
import { KST_TODAY, kstToday } from "../dates";

// SPEC §3·§7.4 — 대여 신청/내 예약/취소 (approved 회원 전용, §8)
export const reservationsRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

reservationsRoute.use("*", requireApproved);

// 날짜 검증 — YYYY-MM-DD 형식 + 실존하는 날짜(2026-02-30 등 차단)
function isDateStr(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}

// 물품 삭제(FK 23503)와 락 대기 초과(55P03)를 결과 배열과 구분하는 sentinel — transaction은
// 배열을 돌려준다(결과로 나올 수 없는 타입). 심볼이라 JSON 직렬화/동등 비교에 안전하다.
const TIMEOUT: unique symbol = Symbol("lock_timeout");

// 신청 — 가용 검사를 advisory 락 + 단일 INSERT 문장으로 처리 (§8 — 동시 신청에도 이중 예약 불가)
reservationsRoute.post("/", async (c) => {
  const user = c.get("user")!;

  // 수령·반납 연락용 — 미등록 회원은 프로필 입력으로 유도 (§4.1)
  if (!user.phone) return c.json({ error: "phone_required" }, 400);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const itemId = Number(body.item_id);
  if (!Number.isInteger(itemId)) return c.json({ error: "bad_id" }, 400);
  const { start_date, end_date } = body;
  if (!isDateStr(start_date) || !isDateStr(end_date))
    return c.json({ error: "bad_date" }, 400);

  // 반개구간 [start, end) — end_date는 반납일이며 대여일에서 제외 (§8 겹침 조건과 동일 기준)
  const days = Math.round(
    (Date.parse(end_date) - Date.parse(start_date)) / 86400000,
  );
  if (days < 1) return c.json({ error: "bad_range" }, 400);
  const today = kstToday();
  if (start_date < today) return c.json({ error: "past_date" }, 400);
  const memo =
    typeof body.memo === "string" && body.memo.trim()
      ? body.memo.trim().slice(0, 500)
      : null;

  // 부분 대여 수량 — 한 예약이 여러 개를 점유한다 (P0). 미지정은 1개.
  // 실물 목록에 조끼 50벌·수신기 77개·이어폰 92개 같은 대량 재고가 있어 '1건 = 1개'로는
  // '수신기 30개만' 같은 신청을 받을 수 없다. 상한 검사는 아래 rentable로 한다.
  const qty = body.qty === undefined ? 1 : Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1)
    return c.json({ error: "bad_qty" }, 400);

  const db: Sql = getDb(c.env);

  // 사전 검사 — 오류 코드 구분용 (가용성은 아래 단일 문장이 보장)
  const [item] = (await db.query(
    "SELECT id, status, kind, max_days, total_qty, qty_broken FROM items WHERE id = $1",
    [itemId],
  )) as {
    id: number;
    status: string;
    kind: string;
    max_days: number;
    total_qty: number;
    qty_broken: number;
  }[];
  if (!item) return c.json({ error: "not_found" }, 404);
  if (item.status !== "active")
    return c.json({ error: "item_not_active" }, 409);
  // 소모품은 대여 대상이 아니라 화면에서 신청 폼을 숨긴다 (§4.2) — 화면 가드는 UX일 뿐이므로
  // 서버도 직접 호출(unapproved 클라이언트 → POST /api/reservations)을 거부한다 (v3.1)
  if (item.kind === "consumable")
    return c.json({ error: "consumable" }, 409);
  if (days > item.max_days) return c.json({ error: "too_long" }, 400);
  // 실제 대여가능 = 전체 − 수리중. 수리중인 대여만 별도 물품이 아니라 같은 품목 안에 있다.
  const rentable = item.total_qty - item.qty_broken;
  if (qty > rentable) return c.json({ error: "too_many" }, 400);

  // 동시 신청 직렬화 — 물품별 advisory 락을 먼저 잡고 같은 트랜잭션에서 가드 INSERT를 실행한다.
  // '단일 문장이니 원자적'은 all-or-nothing 실행일 뿐 두 동시 INSERT의 직렬화를 보장하지 않는다:
  // READ COMMITTED에서 각 문장은 문장 시작 스냅샷을 쓰고(서로의 미커밋 행을 보지 못함) HTTP
  // 드라이버는 무상태라 요청마다 별도 세션이다 — 락이 없으면 total_qty=1 물품에 동시 신청 둘이
  // 모두 통과해 그날이 이중 배정된다. 락은 트랜잭션 종료 시 자동 해제된다.
  const results = await db
    .transaction([
      // 락 대기가 무한정 길어지지 않게 트랜잭션 범위 초 단위로 제한 — 잘못 락되면 55P03로 에러(아래 처리).
      // advisory 락도 같은 LockAcquire→WaitOnLock 경로라 lock_timeout이 적용된다 (PG 16, lock.c).
      db`SET LOCAL lock_timeout = '5s'`,
      db`SELECT pg_advisory_xact_lock(${itemId}::bigint)`,
      // 일별 최대 동시 점유 검사 — 요청 기간의 매 대여일마다 잔여 수량이 있어야 INSERT.
      // '구간과 겹치는 예약 건수'가 아니라 일별 점유로 판정 (§3·§8, v2.11) — 수량 ≥ 2에서
      // 인접 예약(A·B가 붙은) 사이 구간을 건수만으로 막히게 하는 거짓 거부를 없애고,
      // 가용 스트립·캘린더(일별 점유)와 같은 기준이 된다. 반납일은 점유에서 제외(반개구간).
      // 점유량은 건수가 아니라 SUM(qty)다 (P0) — 대량 재고를 한 예약으로 나눠 담는다.
      // total_qty·qty_broken은 락이 잡힌 이 문장 안에서 다시 읽는다 (사전 검사 스냅샷은
      // 관리자가 그 사이 수량을 고치면 어긋난다 — 직렬화 지점은 예약끼리만 막아준다).
      // 상태·max_days도 락 안에서 다시 검사한다 — 사전 검사와 신청 사이에 관리자가 물품을
      // 수리중/폐기로 바꾸거나 최대 기간을 줄이면 가드가 행을 안 만든다 (TOCTOU 차단, v3.1).
      // 재고 자체 검사를 NOT EXISTS 바깥에 둔다 — 겹치는 예약이 하나도 없으면 안쪽 HAVING은
      // 평가될 행 자체가 없어서 통과해 버린다. 그 구멍으로 '사전 검사(위 qty > rentable)와
      // 이 문장 사이에 관리자가 수량을 줄인' 경쟁 조건이 그대로 새어 나간다.
      db`INSERT INTO reservations (item_id, member_id, start_date, end_date, member_memo, qty)
         SELECT ${itemId}, ${user.id}, ${start_date}, ${end_date}, ${memo}, ${qty}
         WHERE ${qty} <= (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
           AND EXISTS (SELECT 1 FROM items
                        WHERE items.id = ${itemId} AND status = 'active' AND kind <> 'consumable'
                          AND ${days} <= max_days)
           AND NOT EXISTS (
           SELECT 1
           FROM generate_series(${start_date}::date, ${end_date}::date - 1, interval '1 day') AS d(day)
           JOIN reservations r
             ON r.item_id = ${itemId}
            AND r.status IN ('pending','approved','picked_up')
            AND r.start_date <= d.day::date
            AND r.end_date > d.day::date
           GROUP BY d.day
           HAVING COALESCE(SUM(r.qty), 0) + ${qty}
                  > (SELECT total_qty - qty_broken FROM items WHERE items.id = ${itemId})
         )
         RETURNING id`,
    ])
    .catch((err: { code?: string }) => {
      // 신청 사이 물품 삭제 — FK 위반은 '수량 없음'이 아니므로 404로 구분
      if (err.code === "23503") return null;
      // 락 대기 초과 — 5초 상한을 넘으면 큐 끝이 아니라 즉시 응답 (lock_timeout · 55P03)
      if (err.code === "55P03") return TIMEOUT;
      throw err;
    });
  if (results === null) return c.json({ error: "not_found" }, 404);
  if (results === TIMEOUT) return c.json({ error: "busy" }, 409);

  const inserted = results[1] as { id: number }[];
  if (inserted.length > 0) return c.json({ id: inserted[0].id }, 201);
  // 0행 — 가드가 거절했다(재고·상태·기간 변경 또는 물품 삭제). 재조회로 원인을 가려
  // not_found/item_not_active/too_long/no_availability를 구분한다 (v2.11⑪, v3.1)
  const [cur] = (await db.query(
    "SELECT status, kind, max_days FROM items WHERE id = $1",
    [itemId],
  )) as { status: string; kind: string; max_days: number }[];
  if (!cur) return c.json({ error: "not_found" }, 404);
  if (cur.status !== "active") return c.json({ error: "item_not_active" }, 409);
  if (cur.kind === "consumable") return c.json({ error: "consumable" }, 409);
  if (days > cur.max_days) return c.json({ error: "too_long" }, 400);
  return c.json({ error: "no_availability" }, 409);
});

// 내 예약 현황·이력 — §4.1 (member_id = 세션 사용자 필수, §8)
reservationsRoute.get("/mine", async (c) => {
  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const rows = await db.query(
    `SELECT r.id, r.item_id, items.name AS item_name,
            (SELECT '/api/photos/' || p.r2_key FROM item_photos p
              WHERE p.item_id = items.id ORDER BY p.sort_order LIMIT 1) AS item_photo,
            r.start_date::text AS start_date, r.end_date::text AS end_date,
            r.qty, r.status, r.status_note, r.member_memo,
            (r.status = 'picked_up' AND r.end_date < ${KST_TODAY}) AS is_overdue,
            r.created_at
       FROM reservations r
       JOIN items ON items.id = r.item_id
      WHERE r.member_id = $1
      ORDER BY r.created_at DESC`,
    [user.id],
  );
  return c.json({ reservations: rows });
});

// 신청 취소 — 본인 + 수령 전(pending/approved)만 (§3)
reservationsRoute.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const rows = (await db.query(
    `UPDATE reservations SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND member_id = $2 AND status IN ('pending','approved')
      RETURNING id`,
    [id, user.id],
  )) as { id: number }[];
  if (rows.length === 0) {
    // 없음/타인 건 → not_found, 종료 상태 → bad_status 구분
    const found = (await db.query(
      "SELECT member_id, status FROM reservations WHERE id = $1",
      [id],
    )) as { member_id: string; status: string }[];
    if (found.length === 0 || found[0].member_id !== user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ error: "bad_status" }, 409);
  }
  return c.json({ ok: true });
});
