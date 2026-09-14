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

// 역할 3단계 (v2.7) — admin(총관리자) > manager(관리자) > user(회원)
export type Role = "user" | "manager" | "admin";
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
};
