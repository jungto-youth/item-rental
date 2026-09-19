import { api, ApiError } from "../api/client";
import type { Role } from "../types";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  status: "active" | "inactive";
};

class SessionStore {
  user: SessionUser | null = null;
  private loaded = false;
  private loading: Promise<SessionUser | null> | null = null;
  private listeners = new Set<() => void>();
  // 세대 번호 — refresh()가 새 요청을 걸면 이전 응답은 결과를 반영하지 못한다
  private gen = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // 중복 fetch 방지 — 최초 1회 로드 후 캐시
  async ensure(): Promise<SessionUser | null> {
    if (this.loaded) return this.user;
    if (!this.loading) this.loading = this.load();
    try {
      return await this.loading;
    } catch {
      // load()는 스스로 예외를 삼킨다 — 여기까지 오는 건 notify()의 리스너가 던진 경우뿐
      return null;
    }
  }

  // 강제 재조회 — 진행 중인 요청을 버리고 새로 시작.
  // (로그아웃 직후 이전 /api/me의 늦은 응답이 로그인 상태를 되살리는 경합 방지)
  async refresh(): Promise<SessionUser | null> {
    this.gen += 1;
    this.loaded = false;
    this.loading = null;
    return this.ensure();
  }

  private async load(): Promise<SessionUser | null> {
    const gen = this.gen;
    let user: SessionUser | null = null;
    try {
      const r = await api<{ user: SessionUser | null }>("/api/me");
      user = r?.user ?? null;
      if (gen !== this.gen) return this.user; // 새 요청이 시작됨 — 늦은 응답은 버린다
      this.user = user;
      this.loaded = true;
    } catch (e) {
      // 401만 '비로그인 확정'. 오프라인·5xx는 캐시하지 않되, 이미 로드된 세션은
      // 그대로 돌려준다 — 일시 오류로 가드가 로그인 화면으로 밀어내는 것을 막는다
      if (!(e instanceof ApiError) || e.status !== 401) return this.user;
      if (gen !== this.gen) return this.user;
      this.user = null;
      this.loaded = true;
    } finally {
      // 내 요청이 아직 최신일 때만 슬롯을 비운다 — refresh()가 건 새 요청을 지우면 안 된다
      if (gen === this.gen) this.loading = null;
    }
    this.notify();
    return this.user;
  }

  // 서버 확인 전에 UI를 '비로그인'으로 확정 — 로그아웃 전용
  clear() {
    this.gen += 1;
    this.user = null;
    this.loaded = false;
    this.loading = null;
    this.notify();
  }
}

export const session = new SessionStore();
