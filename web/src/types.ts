// API 응답 타입 — SPEC §7.4
export type Category = { id: number; name: string; sort_order: number }

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
  category_id: number
  category_name: string
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
  category_id: number
  category_name: string
  photo_count: number
  reservation_count: number
  created_at: string
}

// 물품 상세의 향후 90일 일별 점유 (§7.6)
export type AvailabilityDay = { date: string; reserved: number }
