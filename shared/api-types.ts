// server·web 공유 API 계약 타입 — server/src/routes 가 응답으로 내리는 모양과
// web 이 소비하는 모양을 한 곳에서 정의한다. 두 쪽 모두 상대 import 로 직접 참조한다
// (tsc·Vite·wrangler 모두 추가 설정 불필요). 서버 서비스의 SQL row 타입은
// 이 타입들을 채택해 드리프트를 컴파일 타임에 잡는다.

// API 응답 타입
export type Photo = { id: number; url: string };

// 물품 단위 생애주기 — '수리중'은 생애주기가 아니라 수량 상태(qty_repair)다.
// status(active/repair/retired)를 두 축에 나눠 담던 것을 0005 에서 분리했다 (이슈 #12 §3.1).
export type ItemLifecycle = "active" | "retired";
// 날짜 개념이 없어져 '예약 있음'(reserved)이 사라졌다 — 대여 중이거나 아니거나 둘 중 하나다.
// retired 는 관리자 목록에서만 보인다 — 공개 목록은 폐기 물품을 내리지 않는다.
export type AvailabilityBadge = "available" | "rented" | "repair" | "retired";

// 대여품/소모품  — 소모품은 재고가 줄기만 하고 대여 기간 개념이 없다
export type ItemKind = "rental" | "consumable";

// 카테고리 — 관리자가 물품 등록·수정 중에 만들고 고치는 가벼운 분류
export type Category = { id: number; name: string; item_count: number };

export type Item = {
  id: number;
  name: string;
  lifecycle: ItemLifecycle;
  total_qty: number;
  // 대여가능 수량 = total_qty - qty_repair (서버가 계산해 내려줌)
  rentable_qty?: number;
  qty_repair?: number;
  kind?: ItemKind;
  // 위치는 DB 에서 locations 참조로 정규화됐지만(0005) API 는 계속 이름 문자열을 내려준다 —
  // 화면 표시부는 정규화 전과 같은 모양을 읽는다.
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
  active_rental_count?: number;
};

// 로그인 허용 예외 이메일 — @jungto.org 외 계정의 로그인을 어드민이 관리
export type AllowedEmail = {
  id: string;
  email: string;
  note: string | null;
  created_by: string | null;
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
  // 마지막 상태 전이 시각 — returned 면 반납 처리 시각
  updated_at: string;
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
  // 대여 시점의 물품 표기 — 물품이 개명·이동해도 이 값은 바뀌지 않는다.
  // item_name 이 이미 스냅샷 우선으로 계산되므로 화면은 보통 item_name 만 쓴다.
  item_name_snapshot: string | null;
  item_location_snapshot: string | null;
  // 반납 기한 — 0005 에서 추가됐다. OVERDUE 상태는 저장하지 않고 `due_at < now` 로 파생한다.
  // 관리자 대여 기록에서만 표시한다 (경고·알림 없음 — 이슈 #12 §6.3).
  due_at: string | null;
  // 반납 시각 — 반납된 건에서만 채워진다. updated_at 과 달리 반납 전용이다.
  returned_at: string | null;
  // 관리자가 반납 처리할 때 남기는 메모 — 지금은 writer 가 없어 null 이다.
  admin_memo: string | null;
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
  lifecycle: ItemLifecycle;
  total_qty: number;
  qty_repair: number;
  // 대여가능 수량 = total_qty - qty_repair (서버가 계산해 내려줌)
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
