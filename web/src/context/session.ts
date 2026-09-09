import { api } from '../api/client'
import type { Role } from '../types'

export type SessionUser = {
  id: string
  email: string
  name: string
  phone: string | null
  role: Role
  status: 'pending' | 'approved' | 'inactive'
}

// 세션 스토어 — /api/me 결과를 캐시하고 구독자에게 갱신 알림 (§7.2)
class SessionStore {
  user: SessionUser | null = null
  private loaded = false
  private loading: Promise<SessionUser | null> | null = null
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  // 중복 fetch 방지 — 최초 1회 로드 후 캐시
  async ensure(): Promise<SessionUser | null> {
    if (this.loaded) return this.user
    if (!this.loading) {
      this.loading = api<{ user: SessionUser | null }>('/api/me')
        .then((r) => r.user)
        .catch(() => null)
        .then((user) => {
          this.user = user
          this.loaded = true
          this.notify()
          return user
        })
        .finally(() => {
          this.loading = null
        })
    }
    return this.loading
  }

  async refresh(): Promise<SessionUser | null> {
    this.loaded = false
    return this.ensure()
  }
}

export const session = new SessionStore()
