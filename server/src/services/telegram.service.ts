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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "11/16(일)" — 요일까지 붙이면 날짜를 머릿속으로 계산하지 않아도 된다.
export function formatDueDateLabelKst(
  dueAt: string | null | undefined,
): string | null {
  const full = formatDueDateKst(dueAt);
  if (!full) return null;
  // 달력 날짜의 요일 — UTC 자정으로 파싱하면 시간대와 무관하게 그 날짜의 요일이 나온다.
  const weekday = WEEKDAYS[new Date(`${full}T00:00:00Z`).getUTCDay()];
  return `${full.slice(5).replace("-", "/")}(${weekday})`;
}

// "D-2" / "D-day" / "D+1"(지남) — 반납일이 얼마나 남았는지 한눈에.
export function formatDdayKst(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const dueFull = formatDueDateKst(dueAt);
  const todayFull = formatDueDateKst(now.toISOString());
  if (!dueFull || !todayFull) return null;
  const days = Math.round(
    (Date.parse(`${dueFull}T00:00:00Z`) - Date.parse(`${todayFull}T00:00:00Z`)) /
      86_400_000,
  );
  if (days === 0) return "D-day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

// 한 줄에 담는 물품 목록의 상한(문자 수). 넘으면 뒤를 "외 N종"으로 접어
// 단체방에서 메시지가 여러 줄로 늘어지지 않게 한다.
const ITEM_LIST_MAX = 120;

// 물품 목록을 ", "로 잇는다. 반납일이 물품마다 다르면 이름 뒤에 짧게 붙인다.
function joinItemList(
  rows: { itemName: string; qty: number }[],
  dueLabels: (string | null)[] | null = null,
): string {
  const labels = rows.map((row, index) => {
    const name = `${escapeHtml(oneLine(row.itemName))}${quantitySuffix(row.qty)}`;
    const due = dueLabels?.[index];
    return due ? `${name} ~${due}` : name;
  });

  const shown: string[] = [];
  let length = 0;
  for (const label of labels) {
    // 첫 물품은 길어도 그대로 둔다 — 목록이 통째로 사라지는 것보다 낫다.
    if (shown.length > 0 && length + label.length + 2 > ITEM_LIST_MAX) break;
    shown.push(label);
    length += label.length + 2;
  }

  const hidden = labels.length - shown.length;
  return `${shown.join(", ")}${hidden > 0 ? ` 외 ${hidden}종` : ""}`;
}

// 회원 이름을 키로 묶는다 — 한 사람이 여러 물품을 빌린 경우가 가장 흔하다.
function groupByMember<T extends { memberName: string }>(
  notices: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const notice of notices) {
    const member = escapeHtml(oneLine(notice.memberName));
    const rows = groups.get(member);
    if (rows) rows.push(notice);
    else groups.set(member, [notice]);
  }
  return [...groups];
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

// ===== 관리자 승인·거절 =====

export type ReservationApprovedNotice = {
  itemName: string;
  qty: number;
  memberName: string;
  dueAt: string | null;
};

export function formatReservationApproved(
  notice: ReservationApprovedNotice,
  now: Date = new Date(),
): string {
  const due = formatDueDateLabelKst(notice.dueAt);
  const dday = formatDdayKst(notice.dueAt, now);
  return joinParts([
    `📦 <b>대여 시작</b>: ${escapeHtml(oneLine(notice.itemName))}${quantitySuffix(notice.qty)}`,
    escapeHtml(oneLine(notice.memberName)),
    due ? `~${due}` : null,
    dday,
  ]);
}

export async function notifyReservationApproved(
  env: TelegramEnv,
  notice: ReservationApprovedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationApproved(notice), fetchImpl);
}

// 관리자 화면에서 여러 건을 한 번에 승인했을 때 — 건별 메시지 대신 묶음 1건.
// 한 회원이면 기존 단건 알림과 같은 한 줄 모양을 유지하고, 물품만 ", "로 잇는다.
// 여러 회원이면 회원마다 한 줄씩 — 각 줄은 독립적으로 읽힌다.
export function formatReservationApprovedBatch(
  notices: ReservationApprovedNotice[],
  now: Date = new Date(),
): string {
  if (notices.length === 0) return "";

  const groups = groupByMember(notices).map(([member, rows]) => {
    const labels = rows.map((row) => formatDueDateLabelKst(row.dueAt));
    // 반납일이 모두 같으면 목록 끝에 한 번만, 다르면 물품 이름 뒤에 붙인다.
    const sharedDue =
      labels.every((label) => label !== null && label === labels[0])
        ? labels[0]
        : null;
    return {
      member,
      items: joinItemList(rows, sharedDue ? null : labels),
      due: sharedDue ? `~${sharedDue}` : null,
      dday: sharedDue ? formatDdayKst(rows[0].dueAt, now) : null,
    };
  });

  // 가장 흔한 경우(한 회원)는 통째로 한 줄 — 기존 단건 알림과 같은 순서로 읽힌다.
  const [only] = groups;
  if (groups.length === 1) {
    return joinParts([
      `📦 <b>대여 시작</b>: ${only.items}`,
      only.member,
      only.due,
      only.dday,
    ]);
  }

  return [
    `📦 <b>대여 시작</b>`,
    ...groups.map((group) =>
      joinParts([group.member, group.items, group.due, group.dday]),
    ),
  ].join("\n");
}

export async function notifyReservationApprovedBatch(
  env: TelegramEnv,
  notices: ReservationApprovedNotice[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (notices.length === 0) return false;
  return sendTelegram(env, formatReservationApprovedBatch(notices), fetchImpl);
}

export type ReservationRejectedNotice = {
  itemName: string;
  qty: number;
  memberName: string;
  reason: string;
};

export function formatReservationRejected(
  notice: ReservationRejectedNotice,
): string {
  const reason = notice.reason.trim()
    ? `사유: ${escapeHtml(clip(notice.reason, 40))}`
    : null;
  return joinParts([
    `🚫 <b>거절</b>: ${escapeHtml(oneLine(notice.itemName))}${quantitySuffix(notice.qty)}`,
    escapeHtml(oneLine(notice.memberName)),
    reason,
  ]);
}

export async function notifyReservationRejected(
  env: TelegramEnv,
  notice: ReservationRejectedNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatReservationRejected(notice), fetchImpl);
}

// 관리자 화면에서 여러 건을 한 번에 거절했을 때 — 일괄 승인과 같은 한 줄 규칙.
// 일괄 거절은 사유가 하나로 공통이므로 줄 끝에 한 번만 적는다.
export function formatReservationRejectedBatch(
  notices: ReservationRejectedNotice[],
): string {
  if (notices.length === 0) return "";

  const groups = groupByMember(notices).map(([member, rows]) => ({
    member,
    items: joinItemList(rows),
  }));

  const reason = notices[0]?.reason.trim()
    ? `사유: ${escapeHtml(clip(notices[0].reason, 40))}`
    : null;

  const [only] = groups;
  if (groups.length === 1) {
    return joinParts([
      `🚫 <b>거절</b>: ${only.items}`,
      only.member,
      reason,
    ]);
  }

  return [
    joinParts([`🚫 <b>거절</b>`, reason]),
    ...groups.map((group) => joinParts([group.member, group.items])),
  ].join("\n");
}

export async function notifyReservationRejectedBatch(
  env: TelegramEnv,
  notices: ReservationRejectedNotice[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (notices.length === 0) return false;
  return sendTelegram(env, formatReservationRejectedBatch(notices), fetchImpl);
}

// ===== 반납 지연 다이제스트 =====

export type OverdueEntry = {
  itemName: string;
  qty: number;
  memberName: string;
  dueAt: string | null;
};

export function formatOverdueDigest(
  entries: OverdueEntry[],
  total: number,
): string {
  const head = `⏰ <b>반납 지연</b> ${total}건`;
  if (entries.length === 0) return head;

  const list = entries
    .map((entry) => {
      const due = formatDueDateShortKst(entry.dueAt);
      const item = `${escapeHtml(oneLine(entry.itemName))}${quantitySuffix(entry.qty)}`;
      const member = escapeHtml(oneLine(entry.memberName));
      return `${item} · ${member}${due ? `(~${due})` : ""}`;
    })
    .join(" / ");
  const more =
    total > entries.length ? ` 외 ${total - entries.length}건` : "";
  return `${head}: ${list}${more}`;
}

export async function notifyOverdueDigest(
  env: TelegramEnv,
  entries: OverdueEntry[],
  total: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendTelegram(env, formatOverdueDigest(entries, total), fetchImpl);
}
