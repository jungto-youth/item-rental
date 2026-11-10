// 반납 지연 다이제스트 — 조회·중복 방지·실패 재시도를 실제 SQLite 로 확인한다.
import { test, expect, vi } from "vitest";
import { httpFixture } from "./_http.fixture.ts";
import { sendOverdueDigest } from "../src/services/overdue.service.ts";
import type { Bindings } from "../src/types.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withTelegram(env: Bindings): Bindings {
  return { ...env, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-1" };
}

function seedOverdue(db: ReturnType<typeof httpFixture>["db"]): void {
  db.exec(`
    INSERT INTO members (id, email, name, role)
    VALUES ('m1', 'm1@jungto.org', '홍길동', 'user');
    INSERT INTO items (id, name, total_qty)
    VALUES (1, '텐트', 2);
    INSERT INTO reservations (id, item_id, member_id, status, qty, due_at, group_id)
    VALUES (1, 1, 'm1', 'rented', 2, '2026-01-01T14:59:59.999Z', 'g1');
  `);
}

test("sendOverdueDigest: 지연 건을 한 번만 보낸다", async () => {
  const { db, env } = httpFixture();
  try {
    seedOverdue(db);
    const bodies: string[] = [];
    const fetchImpl = (async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(String(init?.body));
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const now = new Date("2026-11-10T00:00:00Z");
    await sendOverdueDigest(withTelegram(env), now, fetchImpl);
    // 같은 날 두 번째 실행 — 이미 보냈으므로 중복 전송하지 않는다
    await sendOverdueDigest(withTelegram(env), now, fetchImpl);

    expect(bodies).toHaveLength(1);
    const body = JSON.parse(bodies[0]) as { text: string };
    expect(body.text).toContain("반납 지연");
    expect(body.text).toContain("텐트 ×2");
    expect(body.text).toContain("홍길동");
    // 중복 방지 키가 하루치만 남는다
    const log = db
      .prepare("SELECT COUNT(*) AS n FROM notification_log")
      .get() as { n: number };
    expect(log.n).toBe(1);
  } finally {
    db.close();
  }
});

test("sendOverdueDigest: 지연이 없으면 아무것도 보내지 않는다", async () => {
  const { db, env } = httpFixture();
  try {
    const fetchImpl = vi.fn();
    await sendOverdueDigest(
      withTelegram(env),
      new Date("2026-11-10T00:00:00Z"),
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    const log = db
      .prepare("SELECT COUNT(*) AS n FROM notification_log")
      .get() as { n: number };
    expect(log.n).toBe(0);
  } finally {
    db.close();
  }
});

test("sendOverdueDigest: 전송 실패 후 재시도에서 보낸다", async () => {
  const { db, env } = httpFixture();
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    seedOverdue(db);
    const now = new Date("2026-11-10T00:00:00Z");
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await sendOverdueDigest(withTelegram(env), now, failing);

    let sent = 0;
    const ok = (async () => {
      sent++;
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    await sendOverdueDigest(withTelegram(env), now, ok);

    // 실패한 실행이 선점을 되돌려 재시도가 성공한다
    expect(sent).toBe(1);
    const log = db
      .prepare("SELECT COUNT(*) AS n FROM notification_log")
      .get() as { n: number };
    expect(log.n).toBe(1);
  } finally {
    errorSpy.mockRestore();
    db.close();
  }
});
