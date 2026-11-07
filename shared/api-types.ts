// server·web 공유 API 계약 타입 — server/src/routes 가 응답으로 내리는 모양과
// web 이 소비하는 모양을 한 곳에서 정의한다. 두 쪽 모두 상대 import 로 직접 참조한다
// (tsc·Vite·wrangler 모두 추가 설정 불필요). 서버 서비스의 SQL row 타입은
// 이 타입들을 채택해 드리프트를 컴파일 타임에 잡는다.

// API 응답 타입
// thumb_url — 카드·썸네일 줄용 작은 사진. 썸네일이 아직 없으면 서버가 url 과 같은 값을 내린다.
export type Photo = { id: number; url: string; thumb_url: string };

// 물품 단위 생애주기 — '수리중'은 생애주기가 아니라 수량 상태(qty_repair)다.
// status(active/repair/retired)를 두 축에 나눠 담던 것을 0005 에서 분리했다 (이슈 #12 §3.1).
export type ItemLifecycle = "active" | "retired";
// 재고 3영역(rented/pending/reserved) 도입(0012)으로 배지가 늘었다.
//   available   지금 신청 가능 (newCap > 0)
//   reserved    지금은 없지만 예약 가능 (newCap = 0, queueCap > 0)
//   unavailable 지금도 없고 예약도 마감 (queueCap = 0)
// retired 는 관리자 목록에서만 보인다 — 공개 목록은 폐기 물품을 내리지 않는다.
// rented 는 이전 계약과의 호환을 위해 남겨 둔다 — 새 badgeFor 는 반환하지 않는다.
export type AvailabilityBadge =
  | "available"
  | "reserved"
  | "unavailable"
  | "rented"
  | "repair"
  | "retired";

// 대여품/소모품  — 소모품은 재고가 줄기만 하고 대여 기간 개념이 없다
export type ItemKind = "rental" | "consumable";

// 카테고리 — 관리자가 물품 등록·수정 중에 만들고 고치는 가벼운 분류
export type Category = { id: number; name: string; item_count: number };

// 목록 상단 요약 — 모두 '종류 수'다 (2026-10-24 개정, 이슈 #12 §6.2·§6.4).
// 수량은 각 행의 상태 칸(대여 가능 N · 대여 중 N · 수리중 N)이 보여준다.
// 폐기 종류는 어느 값에도 넣지 않는다.
//   types     전체 종류
//   available 대여 가능 종류 — 대여품 중 지금 1개 이상 빌릴 수 있는 종류
//   rented    대여 중 종류 — 점유가 있는 종류
//   repair    수리 중 종류 — 수리 수량이 있는 종류
export type CatalogSummary = {
  types: number;
  available: number;
  rented: number;
  repair: number;
};

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
  // 실제 대여 중(rented) 수량 합 — 재고를 점유한다
  active_now?: number;
  // 승인 대기(pending) 수량 합 — 재고를 점유한다
  pending_qty?: number;
  // 예약(reserved) 수량 합 — 재고를 점유하지 않고 반납을 기다린다
  reserved_qty?: number;
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
  affiliation: string | null;
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

// 대여 — 신청(pending) 또는 예약(reserved) → 승인(rented) → 반납(returned),
// 신청·예약 → 거절(rejected), 신청·예약·대여 중 → 취소(cancelled).
// pending 은 재고를 점유하고, reserved 는 반납을 기다리며 점유하지 않는다.
export type ReservationStatus =
  | "pending"
  | "reserved"
  | "rented"
  | "returned"
  | "cancelled"
  | "rejected";

// 반납 상태 사진 (0009) — 반납 시점의 물품 상태를 남긴다.
// uploaded_role 로 회원이 올린 증빙과 관리자의 회수 확인 사진을 구분한다.
export type ReservationPhoto = {
  id: number;
  url: string;
  uploaded_role: "member" | "admin";
};

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
  // 반납 예정일 — KST 그날의 끝을 UTC ISO 로 저장한다(0005 due_at).
  // 연체는 저장하지 않고 `status='rented' AND due_at < now` 로 파생한다.
  due_at: string | null;
  is_overdue: boolean;
  // 승인·거절 처리 시각과 거절 사유 (0007).
  decided_at: string | null;
  rejected_reason: string | null;
  // 반납 시점에 첨부한 상태 사진 — 최대 3장, 없으면 빈 배열.
  return_photos: ReservationPhoto[];
  // 반납 시점에 남긴 특이사항 — 선택 입력, 없으면 null (0014).
  return_note: string | null;
  // 한 신청을 이루는 행들을 묶는 키. 기존 행은 'legacy-<id>' 다.
  group_id: string | null;
  // 예약(reserved) 건에서 앞에 대기 중인 수량. 그 외에는 0.
  queue_ahead_qty?: number;
};

export type AdminReservation = MyReservation & {
  total_qty: number;
  member_id: string;
  member_name: string | null;
  member_email: string;
  member_phone: string | null;
  // 신청 시점 소속 스냅샷과 현재 프로필 소속 — 화면은 스냅샷을 우선한다.
  member_affiliation: string | null;
  member_affiliation_snapshot: string | null;
  admin_name: string | null;
  // 승인·거절 처리자 이름. 반납 처리자(admin_name)와 다를 수 있다.
  decided_by_name: string | null;
  // 반납은 회원도 직접 할 수 있다 — true 면 회원이 스스로 반납한 건(자기 신고)
  returned_by_member: boolean;
  // 대여 시점의 물품 표기 — 물품이 개명·이동해도 이 값은 바뀌지 않는다.
  // item_name 이 이미 스냅샷 우선으로 계산되므로 화면은 보통 item_name 만 쓴다.
  item_name_snapshot: string | null;
  item_location_snapshot: string | null;
  // 반납 시각 — 반납된 건에서만 채워진다. updated_at 과 달리 반납 전용이다.
  returned_at: string | null;
  // 관리자 메모 슬롯 — 현재 writer 가 없어 항상 null 이다. 반납 시 글은 return_note 를 쓴다.
  admin_memo: string | null;
  // 물품 재고 스냅샷 — 관리자 화면이 승인 가능 여부를 계산한다.
  item_rentable_qty: number;
  item_rented_qty: number;
  item_pending_qty: number;
  item_reserved_qty: number;
  // reserved 행이 지금 승인 가능한지(파생). pending 은 항상 true.
  approvable: boolean;
};

