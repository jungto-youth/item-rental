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
  "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID"
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

// "11/16" — 한 줄 메시지에는 연도를 뺀다.
export function formatDueDateShortKst(
  dueAt: string | null | undefined,
): string | null {
  const full = formatDueDateKst(dueAt);
  return full ? full.slice(5).replace("-", "/") : null;
}

// 사용자 입력이 메시지를 여러 줄로 만들지 않게 공백을 하나로 접는다.
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// 특이사항이 길어도 한 줄이 길어지지 않게 자른다.
function clip(value: string, max: number): string {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// 1개는 굳이 "×1"을 붙이지 않는다.
function quantitySuffix(qty: number): string {
  return qty > 1 ? ` ×${qty}` : "";
}

// 알림은 한 줄로 보낸다 — 단체방에서 여러 줄을 차지하지 않게 필드를 " · "로 잇는다.
function joinParts(parts: (string | null | false)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
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
  qty: number;
  pendingQty: number;
  reservedQty: number;
  dueAt: string | null;
  memberName: string;
};

export function formatReservationCreated(
  notice: ReservationCreatedNotice,
): string {
  // 즉시 배정(pending) 없이 전부 예약이면 라벨을 "예약"으로 바꾼다.
  const reservedOnly = notice.pendingQty === 0 && notice.reservedQty > 0;
  const label = reservedOnly ? "예약" : "신청";
  // 일부만 예약된 경우에만 꼬리에 수량을 붙인다.
  const reservedSuffix =
    notice.pendingQty > 0 && notice.reservedQty > 0
      ? ` (예약 ${notice.reservedQty})`
      : "";
  // 예약 행은 due_at 이 NULL 이다 — 승인 시 날짜가 정해지므로 예약에는 날짜를 넣지 않는다.
  const due =
    notice.pendingQty > 0 ? formatDueDateShortKst(notice.dueAt) : null;

  return joinParts([
    `🔔 <b>${label}</b>: ${escapeHtml(oneLine(notice.itemName))}${quantitySuffix(notice.qty)}${reservedSuffix}`,
    escapeHtml(oneLine(notice.memberName)),
    due ? `~${due}` : null,
  ]);
}

export async function notifyReservationCreated(
  env: TelegramEnv,
  notice: ReservationCreatedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationCreated(notice), fetchImpl);
}

// ===== 반납 =====

export type ReservationReturnedNotice = {
  itemName: string;
  qty: number;
  memberName: string;
  note: string | null;
  // true = 회원이 직접 반납, false = 관리자가 처리
  byMember: boolean;
};

export function formatReservationReturned(
  notice: ReservationReturnedNotice,
): string {
  // 회원 반납이 기본이라 관리자 처리일 때만 표시를 붙인다.
  const label = notice.byMember ? "반납" : "반납(관리)";
  const note = notice.note ? escapeHtml(clip(notice.note, 40)) : null;

  return joinParts([
    `✅ <b>${label}</b>: ${escapeHtml(oneLine(notice.itemName))}${quantitySuffix(notice.qty)}`,
    escapeHtml(oneLine(notice.memberName)),
    note ? `⚠️ ${note}` : null,
  ]);
}

export async function notifyReservationReturned(
  env: TelegramEnv,
  notice: ReservationReturnedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationReturned(notice), fetchImpl);
}
