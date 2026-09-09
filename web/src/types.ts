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
