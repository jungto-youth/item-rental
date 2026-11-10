// 텔레그램 알림 — 메시지 포맷과 전송 실패 계약을 고정한다.
//
// 가장 중요한 계약은 "알림이 실패해도 throw 하지 않는다" 이다. 라우트가 이 함수를
// ctx.waitUntil 로 부르므로, 여기서 던지면 unhandled rejection 만 남고 대여는 이미 성공이다.
import { test, expect, vi } from "vitest";
import {
  escapeHtml,
  formatDueDateKst,
  formatDueDateShortKst,
  formatOverdueDigest,
  formatReservationApproved,
  formatReservationCreated,
  formatReservationRejected,
  formatReservationReturned,
  isTelegramConfigured,
  notifyReservationCreated,
  sendTelegram,
  type TelegramEnv,
} from "../src/services/telegram.service.ts";

const env: TelegramEnv = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_ID: "-100999",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("isTelegramConfigured: 토큰과 chat_id 가 모두 있어야 켜진다", () => {
  expect(isTelegramConfigured(env)).toBe(true);
  expect(isTelegramConfigured({ TELEGRAM_BOT_TOKEN: "t" })).toBe(false);
  expect(isTelegramConfigured({ TELEGRAM_CHAT_ID: "-1" })).toBe(false);
  expect(
    isTelegramConfigured({ TELEGRAM_BOT_TOKEN: "  ", TELEGRAM_CHAT_ID: "-1" }),
  ).toBe(false);
});

test("escapeHtml: 텔레그램 HTML 에서 태그로 해석되는 문자만 바꾼다", () => {
  expect(escapeHtml("텐트 <4인용> & 수납")).toBe(
    "텐트 &lt;4인용&gt; &amp; 수납",
  );
});

test("formatDueDateKst: UTC 저장값을 KST 달력 날짜로 되돌린다", () => {
  // 2026-11-16 23:59:59.999 KST = 14:59:59.999 UTC
  expect(formatDueDateKst("2026-11-16T14:59:59.999Z")).toBe("2026-11-16");
  expect(formatDueDateKst(null)).toBeNull();
  expect(formatDueDateKst("not-a-date")).toBeNull();
});

test("formatDueDateShortKst: 한 줄 메시지용 MM/DD 로 줄인다", () => {
  expect(formatDueDateShortKst("2026-11-16T14:59:59.999Z")).toBe("11/16");
  expect(formatDueDateShortKst(null)).toBeNull();
});

test("formatReservationCreated: 라벨·물품·수량·이름·날짜를 한 줄로 담는다", () => {
  const text = formatReservationCreated({
    itemName: "텐트 <4인용>",
    qty: 3,
    pendingQty: 2,
    reservedQty: 1,
    dueAt: "2026-11-16T14:59:59.999Z",
    memberName: "홍길동",
  });

  expect(text).toBe(
    "🔔 <b>신청</b>: 텐트 &lt;4인용&gt; ×3 (예약 1) · 홍길동 · ~11/16",
  );
  // 단체방을 여러 줄 차지하지 않도록 한 줄로 보낸다
  expect(text).not.toContain("\n");
});

test("formatReservationCreated: 전부 예약이면 라벨이 예약이고 날짜를 뺀다", () => {
  const text = formatReservationCreated({
    itemName: "의자",
    qty: 2,
    pendingQty: 0,
    reservedQty: 2,
    dueAt: "2026-11-16T14:59:59.999Z",
    memberName: "김회원",
  });

  // 예약 행은 due_at 이 NULL 이라 승인 전에는 날짜를 알 수 없다
  expect(text).toBe("🔔 <b>예약</b>: 의자 ×2 · 김회원");
});

test("formatReservationCreated: 1개는 수량을 생략하고 입력의 줄바꿈을 접는다", () => {
  const text = formatReservationCreated({
    itemName: "텐트\n4인용",
    qty: 1,
    pendingQty: 1,
    reservedQty: 0,
    dueAt: "2026-11-16T14:59:59.999Z",
    memberName: "홍\n길동",
  });

  expect(text).toBe("🔔 <b>신청</b>: 텐트 4인용 · 홍 길동 · ~11/16");
  expect(text).not.toContain("\n");
});

test("formatReservationReturned: 회원 반납과 특이사항을 한 줄로 담는다", () => {
  const text = formatReservationReturned({
    itemName: "빔 프로젝터",
    qty: 1,
    memberName: "홍길동",
    note: "렌즈 캡 분실",
    byMember: true,
  });

  expect(text).toBe("✅ <b>반납</b>: 빔 프로젝터 · 홍길동 · ⚠️ 렌즈 캡 분실");
  expect(text).not.toContain("\n");
});

test("formatReservationReturned: 관리자 반납은 라벨로 구분하고 긴 특이사항은 자른다", () => {
  const text = formatReservationReturned({
    itemName: "텐트",
    qty: 2,
    memberName: "홍길동",
    note: "가".repeat(50),
    byMember: false,
  });

  expect(text).toBe(
    `✅ <b>반납(관리)</b>: 텐트 ×2 · 홍길동 · ⚠️ ${"가".repeat(39)}…`,
  );
});

test("formatReservationApproved: 대여 시작을 한 줄로 알린다", () => {
  const text = formatReservationApproved({
    itemName: "텐트",
    qty: 2,
    memberName: "홍길동",
    dueAt: "2026-11-16T14:59:59.999Z",
  });

  expect(text).toBe("📦 <b>대여 시작</b>: 텐트 ×2 · 홍길동 · ~11/16");
});

test("formatReservationRejected: 거절 사유를 붙인다", () => {
  const text = formatReservationRejected({
    itemName: "텐트",
    qty: 1,
    memberName: "홍길동",
    reason: "재고가 부족합니다",
  });

  expect(text).toBe(
    "🚫 <b>거절</b>: 텐트 · 홍길동 · 사유: 재고가 부족합니다",
  );
});

test("formatOverdueDigest: 지연 건을 한 줄로 요약하고 초과분은 외 N건", () => {
  const text = formatOverdueDigest(
    [
      {
        itemName: "텐트",
        qty: 2,
        memberName: "홍길동",
        dueAt: "2026-11-10T14:59:59.999Z",
      },
      {
        itemName: "의자",
        qty: 1,
        memberName: "김회원",
        dueAt: "2026-11-09T14:59:59.999Z",
      },
    ],
    5,
  );

  expect(text).toBe(
    "⏰ <b>반납 지연</b> 5건: 텐트 ×2 · 홍길동(~11/10) / 의자 · 김회원(~11/09) 외 3건",
  );
  expect(text).not.toContain("\n");
});

test("sendTelegram: 설정이 없으면 fetch 를 부르지 않고 false", async () => {
  const fetchImpl = vi.fn();
  const sent = await sendTelegram(
    { TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" },
    "안녕",
    fetchImpl as unknown as typeof fetch,
  );
  expect(sent).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("sendTelegram: Bot API 로 HTML 메시지를 보낸다", async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init };
    return jsonResponse({ ok: true });
  }) as unknown as typeof fetch;

  const sent = await sendTelegram(env, "<b>테스트</b>", fetchImpl);

  expect(sent).toBe(true);
  expect(captured!.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
  const body = JSON.parse(String(captured!.init!.body)) as Record<string, unknown>;
  expect(body).toMatchObject({
    chat_id: "-100999",
    text: "<b>테스트</b>",
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
});

test("sendTelegram: HTTP 오류·네트워크 오류에도 throw 하지 않고 false", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const httpError = (async () => jsonResponse({ ok: false }, 429)) as unknown as typeof fetch;
    expect(await sendTelegram(env, "x", httpError)).toBe(false);

    const networkError = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await sendTelegram(env, "x", networkError)).toBe(false);
  } finally {
    errorSpy.mockRestore();
  }
});

test("notifyReservationCreated: 전송이 실패해도 false 로 끝난다", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failingFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const sent = await notifyReservationCreated(
      env,
      {
        itemName: "텐트",
        qty: 1,
        pendingQty: 1,
        reservedQty: 0,
        dueAt: null,
        memberName: "홍길동",
      },
      failingFetch,
    );
    expect(sent).toBe(false);
  } finally {
    errorSpy.mockRestore();
  }
});
