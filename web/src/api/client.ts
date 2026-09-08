// SPEC §7.2 — fetch 래퍼 (401 처리는 1주차 인증 플로우에서 확장)
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) {
    // TODO(1주차): session-context를 null로 갱신 → 라우트 가드가 /login 유도
  }
  if (!res.ok) {
    throw new ApiError(res.status, `API ${res.status}: ${path}`)
  }
  return res.json() as Promise<T>
}
