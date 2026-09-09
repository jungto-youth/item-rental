// API 응답 타입 — SPEC §7.4
export type Photo = { id: number; url: string }

export type ItemStatus = 'active' | 'repair' | 'retired'
export type AvailabilityBadge = 'available' | 'reserved' | 'rented' | 'repair'

export type Item = {
  id: number
  name: string
  status: ItemStatus
  total_qty: number
  max_days: number
  description?: string | null
  photos: Photo[]
  availability_badge?: AvailabilityBadge
  active_now?: number
}

export type AdminItem = {
  id: number
  name: string
  description: string | null
  status: ItemStatus
  total_qty: number
  max_days: number
  photo_count: number
  reservation_count: number
  created_at: string
}

// 물품 상세의 향후 90일 일별 점유 (§7.6)
export type AvailabilityDay = { date: string; reserved: number }

// 역할 3단계 (v2.7) — admin(총관리자) > manager(관리자) > user(회원)
export type Role = 'user' | 'manager' | 'admin'
export type MemberStatus = 'pending' | 'approved' | 'inactive'

export type AdminMember = {
  id: string
  email: string
  name: string
  phone: string | null
  role: Role
  status: MemberStatus
  created_at: string
}

// 대여 예약 (§3 상태 흐름 — 연체는 저장 상태가 아닌 계산값)
export type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'picked_up'
  | 'returned'
  | 'rejected'
  | 'cancelled'

export type MyReservation = {
  id: number
  item_id: number
  item_name: string
  item_photo: string | null
  start_date: string
  end_date: string
  status: ReservationStatus
  status_note: string | null
  member_memo: string | null
  is_overdue: boolean
  created_at: string
}

export type AdminReservation = MyReservation & {
  total_qty: number
  member_id: string
  member_name: string | null
  member_email: string
  member_phone: string | null
  admin_name: string | null
  conflict_count: number
}
