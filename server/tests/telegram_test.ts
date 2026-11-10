// 텔레그램 알림 — 메시지 포맷과 전송 실패 계약을 고정한다.
//
// 가장 중요한 계약은 "알림이 실패해도 throw 하지 않는다" 이다. 라우트가 이 함수를
// ctx.waitUntil 로 부르므로, 여기서 던지면 unhandled rejection 만 남고 대여는 이미 성공이다.
import { test, expect, vi } from "vitest";
import {
  escapeHtml,
  formatDueDateKst,
  formatReservationCreated,
  formatReservationReturned,
  isTelegramConfigured,
  notifyReservationCreated,
  sendTelegram,
  type TelegramEnv,
} from "../src/services/telegram.service.ts";

const env: TelegramEnv = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_ID: "-100999",
  PUBLIC_BASE_URL: "https://rental.example.com/",
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

test("formatReservationCreated: 물품·수량 분해·신청자·메모·링크를 담는다", () => {
  const text = formatReservationCreated(
    {
      itemName: "텐트 <4인용>",
      locationName: "창고 A",
      qty: 3,
      pendingQty: 2,
      reservedQty: 1,
      dueAt: "2026-11-16T14:59:59.999Z",
      memo: "행사 & <사용>",
      memberName: "홍길동",
      affiliation: "청년지부 · 서울",
    },
    env,
  );

  expect(text).toContain("새 대여 신청");
  expect(text).toContain("물품: 텐트 &lt;4인용&gt; (창고 A)");
  expect(text).toContain("수량: 3 (즉시 2 · 예약 1)");
  expect(text).toContain("신청자: 홍길동 · 청년지부 · 서울");
  expect(text).toContain("반납 예정: 2026-11-16");
  expect(text).toContain("메모: 행사 &amp; &lt;사용&gt;");
  // 끝의 슬래시는 정규화되고 관리자 대여 관리 화면을 가리킨다
  expect(text).toContain(
    '<a href="https://rental.example.com/admin/reservations">대여 관리 열기</a>',
  );
});

test("formatReservationCreated: 예약만 있으면 (예약), 링크 설정이 없으면 링크를 뺀다", () => {
  const text = formatReservationCreated(
    {
      itemName: "의자",
      qty: 2,
      pendingQty: 0,
      reservedQty: 2,
      dueAt: null,
      memo: null,
      memberName: "김회원",
      affiliation: null,
    },
    { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-1" },
  );

  expect(text).toContain("수량: 2 (예약)");
  expect(text).not.toContain("반납 예정");
  expect(text).not.toContain("메모:");
  expect(text).not.toContain("<a href=");
});

test("formatReservationReturned: 반납 주체와 특이사항을 구분한다", () => {
  const text = formatReservationReturned(
    {
      itemName: "빔 프로젝터",
      qty: 1,
      memberName: "홍길동",
      affiliation: "청년지부",
      note: "렌즈 캡 분실",
      byMember: true,
    },
    env,
  );

  expect(text).toContain("반납 완료");
  expect(text).toContain("회원 직접 반납");
  expect(text).toContain("물품: 빔 프로젝터");
  expect(text).toContain("특이사항: 렌즈 캡 분실");
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
        memo: null,
        memberName: "홍길동",
        affiliation: null,
      },
      failingFetch,
    );
    expect(sent).toBe(false);
  } finally {
    errorSpy.mockRestore();
  }
});
