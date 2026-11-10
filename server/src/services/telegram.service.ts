// 텔레그램 알림 — 관리자 단체방으로 대여 이벤트를 보낸다.
//
// 알림은 업무 이벤트의 부산물이다. 전송 실패가 대여 신청·반납을 막으면 안 되므로
// 모든 함수가 throw 하지 않고 false 를 돌려준다. 라우트는 응답을 먼저 보내고
// ctx.waitUntil 로 이 함수를 뒤에서 실행한다.
//
// 토큰·chat_id 가 없으면 조용히 꺼진다 — 로컬 개발과 테스트가 그대로 동작한다.
import type { Bindings } from "../types";

const API_BASE = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 5_000;
// sendMessage 의 text 상한 (Telegram Bot API).
const MAX_TEXT_LENGTH = 4_096;

export type TelegramEnv = Pick<
  Bindings,
  "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID" | "PUBLIC_BASE_URL"
>;

export function isTelegramConfigured(env: TelegramEnv): boolean {
  return Boolean(
    env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_CHAT_ID?.trim(),
  );
}

// parse_mode=HTML 에서 깨지지 않게 & < > 만 바꾼다. 물품명·메모는 사용자 입력이라
// 그대로 넣으면 태그로 해석되거나 전송이 거부될 수 있다.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// due_at 은 KST 달력 날짜의 끝(23:59:59.999)을 UTC ISO 로 저장한 값이다 —
// 메시지에는 사람이 읽는 KST 날짜(YYYY-MM-DD)로 되돌린다.
export function formatDueDateKst(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function adminReservationsUrl(env: TelegramEnv): string | null {
  const base = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/admin/reservations` : null;
}

function joinLines(lines: (string | null | false)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

// 토큰·chat_id 가 없으면 아무것도 하지 않는다. 실패는 로그만 남기고 false 로 끝낸다.
export async function sendTelegram(
  env: TelegramEnv,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;

  const safeText =
    text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
      : text;

  try {
    const response = await fetchImpl(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: safeText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // 본문에는 토큰이 없다(토큰은 URL 에만 있다) — 원인 파악용으로 남긴다.
      console.error(
        "telegram: send failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegram: send error", err);
    return false;
  }
}

// ===== 대여 신청 =====

export type ReservationCreatedNotice = {
  itemName: string;
  locationName?: string | null;
  qty: number;
  pendingQty: number;
  reservedQty: number;
  dueAt: string | null;
  memo: string | null;
  memberName: string;
  affiliation: string | null;
};

export function formatReservationCreated(
  notice: ReservationCreatedNotice,
  env: TelegramEnv,
): string {
  // 한 신청이 즉시 배정(pending)과 예약(reserved)으로 나뉠 수 있다 — 둘 다 보여준다.
  let qtyLine = `수량: ${notice.qty}`;
  if (notice.pendingQty > 0 && notice.reservedQty > 0) {
    qtyLine += ` (즉시 ${notice.pendingQty} · 예약 ${notice.reservedQty})`;
  } else if (notice.reservedQty > 0) {
    qtyLine += " (예약)";
  }

  const location = notice.locationName
    ? ` (${escapeHtml(notice.locationName)})`
    : "";
  const affiliation = notice.affiliation
    ? ` · ${escapeHtml(notice.affiliation)}`
    : "";
  const due = formatDueDateKst(notice.dueAt);
  const link = adminReservationsUrl(env);

  return joinLines([
    "🔔 <b>새 대여 신청</b>",
    `물품: ${escapeHtml(notice.itemName)}${location}`,
    qtyLine,
    `신청자: ${escapeHtml(notice.memberName)}${affiliation}`,
    due ? `반납 예정: ${due}` : null,
    notice.memo ? `메모: ${escapeHtml(notice.memo)}` : null,
    link ? `<a href="${escapeHtml(link)}">대여 관리 열기</a>` : null,
  ]);
}

export async function notifyReservationCreated(
  env: TelegramEnv,
  notice: ReservationCreatedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationCreated(notice, env), fetchImpl);
}

// ===== 반납 =====

export type ReservationReturnedNotice = {
  itemName: string;
  qty: number;
  memberName: string;
  affiliation: string | null;
  note: string | null;
  // true = 회원이 직접 반납, false = 관리자가 처리
  byMember: boolean;
};

export function formatReservationReturned(
  notice: ReservationReturnedNotice,
  env: TelegramEnv,
): string {
  const actor = notice.byMember ? "회원 직접 반납" : "관리자 처리";
  const affiliation = notice.affiliation
    ? ` · ${escapeHtml(notice.affiliation)}`
    : "";
  const link = adminReservationsUrl(env);

  return joinLines([
    `✅ <b>반납 완료</b> (${actor})`,
    `물품: ${escapeHtml(notice.itemName)}`,
    `수량: ${notice.qty}`,
    `반납자: ${escapeHtml(notice.memberName)}${affiliation}`,
    notice.note ? `특이사항: ${escapeHtml(notice.note)}` : null,
    link ? `<a href="${escapeHtml(link)}">대여 관리 열기</a>` : null,
  ]);
}

export async function notifyReservationReturned(
  env: TelegramEnv,
  notice: ReservationReturnedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationReturned(notice, env), fetchImpl);
}
