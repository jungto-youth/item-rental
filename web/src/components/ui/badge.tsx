const LABELS: Record<string, string> = {
  available: "대여 가능",
  reserved: "예약 가능",
  unavailable: "신청 마감",
  rented: "대여 중",
  repair: "수리 중",
  retired: "폐기",
  overdue: "기한 지남",
  pending: "승인 대기",
  rejected: "거절",
  withdrawn: "탈퇴",
  user: "회원",
  admin: "관리자",
  returned: "반납 완료",
  cancelled: "취소",
};

const TONES: Record<string, string> = {
  available: "bg-primary-soft text-primary-strong",
  reserved: "bg-primary-soft text-primary-strong",
  unavailable: "bg-surface-muted text-ink-2",
  admin: "bg-primary-soft text-primary-strong",
  repair: "bg-warning-soft text-warning",
  overdue: "bg-danger-soft text-danger",
  pending: "bg-warning-soft text-warning",
  rejected: "bg-danger-soft text-danger",
  neutral: "bg-surface-muted text-ink-2",
};

const DOTS: Record<string, string> = {
  available: "bg-primary",
  reserved: "bg-primary",
  unavailable: "bg-ink-3",
  admin: "bg-primary",
  repair: "bg-warning",
  overdue: "bg-danger",
  pending: "bg-warning",
  rejected: "bg-danger",
  neutral: "bg-ink-3",
};

export function Badge(props: { kind?: string; label?: string }) {
  const kind = () => props.kind ?? "neutral";
  const text = () => props.label || LABELS[kind()] || kind();
  const tone = () =>
    kind() === "available" ||
    kind() === "reserved" ||
    kind() === "admin" ||
    kind() === "repair" ||
    kind() === "overdue" ||
    kind() === "pending" ||
    kind() === "rejected"
      ? kind()
      : "neutral";

  return (
    <span class="inline-flex align-middle">
      <span
        class={`inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-fine leading-none whitespace-nowrap ${TONES[tone()]}`}
      >
        <span
          class={`size-1.5 shrink-0 rounded-full ${DOTS[tone()]}`}
          aria-hidden="true"
        />
        <span>{text()}</span>
      </span>
    </span>
  );
}
