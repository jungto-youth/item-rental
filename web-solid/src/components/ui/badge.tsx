const LABELS: Record<string, string> = {
  available: "대여 가능",
  rented: "대여 중",
  repair: "수리중",
  retired: "폐기",
  withdrawn: "탈퇴",
  user: "회원",
  admin: "관리자",
  returned: "반납 완료",
  cancelled: "취소",
};

export function Badge(props: { kind?: string; label?: string }) {
  const kind = () => props.kind ?? "neutral";
  const text = () => props.label || LABELS[kind()] || kind();
  const tone = () =>
    kind() === "available" || kind() === "admin" || kind() === "repair"
      ? kind()
      : "neutral";

  return (
    <span class="x-badge">
      <span class={`badge ${tone()}`}>
        <span class={`dot ${tone()}`} aria-hidden="true" />
        <span>{text()}</span>
      </span>
    </span>
  );
}
