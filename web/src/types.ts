// API 응답 타입 — SPEC §7.4
export type Photo = { id: number; url: string };

export type ItemStatus = "active" | "repair" | "retired";
export type AvailabilityBadge = "available" | "reserved" | "rented" | "repair";

// 대여품/소모품 (§8 v3.0) — 소모품은 재고가 줄기만 하고 대여 기간 개념이 없다
export type ItemKind = "rental" | "consumable";

export type Item = {
  id: number;
  name: string;
  status: ItemStatus;
  total_qty: number;
  max_days: number;
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
  active_now?: number;
};

// 물품 상세의 향후 90일 일별 점유 (§7.6)
export type AvailabilityDay = { date: string; reserved: number };

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

// 대여 예약 (§3 상태 흐름 — 연체는 저장 상태가 아닌 계산값)
export type ReservationStatus =
  | "pending"
  | "approved"
  | "picked_up"
  | "returned"
  | "rejected"
  | "cancelled";

export type MyReservation = {
  id: number;
  item_id: number;
  item_name: string;
  item_photo: string | null;
  start_date: string;
  end_date: string;
  // 부분 대여 수량 (§8 P0) — 한 예약이 여러 개를 점유한다. 서버가 항상 내려준다
  qty: number;
  status: ReservationStatus;
  status_note: string | null;
  member_memo: string | null;
  is_overdue: boolean;
  created_at: string;
};

export type AdminReservation = MyReservation & {
  total_qty: number;
  member_id: string;
  member_name: string | null;
  member_email: string;
  member_phone: string | null;
  admin_name: string | null;
  conflict_count: number;
};

// 관리자 대시보드 (§4.4) — /api/admin/dashboard
export type DashboardRow = {
  id: number;
  item_id: number;
  item_name: string;
  member_name: string;
  member_phone: string | null;
  start_date: string;
  end_date: string;
  // 부분 대여 수량 (§3) — 수령·반납 시 실제로 챙길 개수
  qty: number;
};

export type Dashboard = {
  pending_count: number;
  pickups_count: number;
  returns_count: number;
  overdue_count: number;
  pickups: DashboardRow[];
  returns: DashboardRow[];
  overdue: (DashboardRow & { days_late: number })[];
  // 하드 리밋(수령/반납/연체 각 20건)으로 잘렸는지 — 잘렸으면 화면에 '상위 20건만' 안내 (§4.4, v3.1)
  pickups_truncated: boolean;
  returns_truncated: boolean;
  overdue_truncated: boolean;
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
