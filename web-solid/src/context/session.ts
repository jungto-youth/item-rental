import { createSignal } from "solid-js";
import { api, ApiError } from "../api/client";
import type { Role } from "../types";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  deactivated_at: string | null;
};

const [user, setUser] = createSignal<SessionUser | null>(null);
const [unreachable, setUnreachable] = createSignal(false);

let loaded = false;
let loading: Promise<SessionUser | null> | null = null;
let generation = 0;

async function load(): Promise<SessionUser | null> {
  const gen = generation;
  // Solid 2 의 signal 쓰기는 flush 전까지 읽기에서 보이지 않을 수 있다.
  // 같은 async 흐름에서 방금 받은 값을 돌려줘야 가드가 null 로 오판하지 않는다.
  let result: SessionUser | null = null;
  try {
    const r = await api<{ user: SessionUser | null }>("/api/me");
    if (gen !== generation) return user();
    result = r?.user ?? null;
    setUser(result);
    loaded = true;
    setUnreachable(false);
  } catch (e) {
    // 401만 '비로그인 확정'. 오프라인·5xx는 캐시하지 않되 이미 로드된 세션은 유지한다.
    if (!(e instanceof ApiError) || e.status !== 401) {
      if (gen === generation && user() === null) setUnreachable(true);
      return user();
    }
    if (gen !== generation) return user();
    result = null;
    setUser(null);
    loaded = true;
    setUnreachable(false);
  } finally {
    if (gen === generation) loading = null;
  }
  return result;
}

async function ensure(): Promise<SessionUser | null> {
  if (loaded) return user();
  if (!loading) loading = load();
  try {
    return await loading;
  } catch {
    return null;
  }
}

async function refresh(): Promise<SessionUser | null> {
  generation += 1;
  loaded = false;
  loading = null;
  return ensure();
}

function clear() {
  generation += 1;
  setUser(null);
  loaded = false;
  loading = null;
}

export const session = {
  user,
  unreachable,
  isAdmin: () => user()?.role === "admin",
  ensure,
  refresh,
  clear,
};
