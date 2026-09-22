// API 응답 타입
export type Photo = { id: number; url: string };

export type ItemStatus = "active" | "repair" | "retired";
// 날짜 개념이 없어져 '예약 있음'(reserved)이 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다
export type AvailabilityBadge = "available" | "rented" | "repair";

// 대여품/소모품  — 소모품은 재고가 줄기만 하고 대여 기간 개념이 없다
export type ItemKind = "rental" | "consumable";

// 카테고리 — 관리자가 물품 등록·수정 중에 만들고 고치는 가벼운 분류
export type Category = { id: number; name: string; item_count: number };

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
  description?: string | null;
  // 태그 id 목록 — 관리자 단건 조회(/api/admin/items/:id)가 채운다. 공개 상세에는 없다
  category_ids?: number[];
  photos: Photo[];
  availability_badge?: AvailabilityBadge;
  // 현재 대여 중인 수량 합 — 가용성 판정의 유일한 근거
  active_now?: number;
  // 태그(카테고리) — 목록에서는 안 내리고 상세에서만
  categories?: { id: number; name: string }[];
};

// 역할 2단계 (v3.2) — admin(관리자) > user(회원)
export type Role = "user" | "admin";

export type AdminMember = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  deactivated_at: string | null; // null = 활성, 값 있으면 탈퇴(소프트 삭제) 시각
  created_at: string;
};

// 대여  — 신청 즉시 rented, 관리자가 returned 처리, 본인이 cancelled
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

// 관리자 대시보드 () — /api/admin/dashboard
// 날짜 개념이 없어져 '오늘 수령/반납 예정'과 '연체'가 사라졌다. 대신 전체 물품(폐기 포함)을
// 내려줘서 화면이 물품별 현재 상태를 그룹으로 나눠 보여준다.
export type DashboardRenter = {
  member_name: string;
  member_phone: string | null;
  // 부분 대여 수량 — 반납 시 실제로 챙길 개수
  qty: number;
};

export type DashboardItem = {
  id: number;
  name: string;
  kind: ItemKind;
  status: ItemStatus;
  total_qty: number;
  qty_broken: number;
  // 대여가능 수량 = total_qty - qty_broken (서버가 계산해 내려줌)
  rentable_qty: number;
  // 현재 대여 중인 수량 합 — 가용성 판정의 유일한 근거
  active_now: number;
  // 대표 사진 URL (첫번째 사진). 없으면 null
  photo: string | null;
  // 현재 이 물품을 대여 중인 회원 목록
  current_renters: DashboardRenter[];
};

export type Dashboard = {
  items: DashboardItem[];
};
