// API 응답 타입 — SPEC §7.4
export type Photo = { id: number; url: string };

export type ItemStatus = "active" | "repair" | "retired";
// 날짜 개념이 없어져 '예약 있음'(reserved)이 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다
export type AvailabilityBadge = "available" | "rented" | "repair";

// 대여품/소모품 (§8 v3.0) — 소모품은 재고가 줄기만 하고 대여 기간 개념이 없다
export type ItemKind = "rental" | "consumable";

export type Item = {
  id: number;
  name: string;
  status: ItemStatus;
  total_qty: number;
  // 대여가능 수량 = total_qty - qty_broken (서버가 계산해 내려줌)
  rentable_qty?: number;
  qty_broken?: number;
  kind?: ItemKind;
  location?: string | null;
  size?: string | null;
  color?: string | null;
  note?: string | null;
  description?: string | null;
  photos: Photo[];
  availability_badge?: AvailabilityBadge;
  // 현재 대여 중인 수량 합 — 가용성 판정의 유일한 근거
  active_now?: number;
};

// 역할 2단계 (v3.2) — admin(관리자) > user(회원)
export type Role = "user" | "admin";
export type MemberStatus = "pending" | "approved" | "inactive";

export type AdminMember = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  status: MemberStatus;
  created_at: string;
};

// 대여 (§3 상태 흐름) — 신청 즉시 rented, 관리자가 returned 처리, 본인이 cancelled
export type ReservationStatus = "rented" | "returned" | "cancelled";

export type MyReservation = {
  id: number;
  item_id: number;
  item_name: string;
  item_photo: string | null;
  // 부분 대여 수량 — 한 대여가 여러 개를 점유한다. 서버가 항상 내려준다
  qty: number;
  status: ReservationStatus;
  member_memo: string | null;
  created_at: string;
};

export type AdminReservation = MyReservation & {
  total_qty: number;
  member_id: string;
  member_name: string | null;
  member_email: string;
  member_phone: string | null;
  admin_name: string | null;
  // 반납은 회원도 직접 할 수 있다 — true 면 회원이 스스로 반납한 건(자기 신고)
  returned_by_member: boolean;
};

// 관리자 대시보드 (§4.4) — /api/admin/dashboard
// 날짜가 없어져 '오늘 수령/반납 예정'과 '연체'가 사라졌다 — 지금 나가 있는 물품만 본다
export type DashboardRow = {
  id: number;
  item_id: number;
  item_name: string;
  member_name: string;
  member_phone: string | null;
  // 부분 대여 수량 — 반납 시 실제로 챙길 개수
  qty: number;
  created_at: string;
};

export type Dashboard = {
  rented_count: number;
  returned_count: number;
  cancelled_count: number;
  rented: DashboardRow[];
  // 하드 리밋(50건)으로 잘렸는지 — 잘렸으면 화면에 '상위 50건만' 안내
  rented_truncated: boolean;
};

// 과거 대여 이력 (§4.3) — 2025 청년페스타 '물품대여' 시트 스냅샷.
// 살아 있는 운영 큐인 reservations 와 별개 테이블이다 (migrations/0012 주석 참고)
export type RentalHistoryRow = {
  id: number;
  source_row: number | null;
  item_name: string;
  // 시트에 상품 ID 가 없어 대부분 null 이다 (216건 중 10건만 연결) — 이름 문자열로만 이어진다
  item_id: number | null;
  item_scope: string | null; // '청년물품' | '회관물품' | null
  member_name: string;
  org: string | null;
  qty: number | null;
  requested_on: string | null;
  start_at: string | null;
  end_at: string | null;
  use_location: string | null;
  procurement: string | null;
  checkout_state: string | null;
  note: string | null;
};
