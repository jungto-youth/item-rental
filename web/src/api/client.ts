// SPEC §7.2 — fetch 래퍼 (401 처리는 1주차 인증 플로우에서 확장)
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData(사진 업로드)는 브라우저가 multipart boundary를 자동 지정하게 둬야 함 — content-type 수동 지정 금지
  const isForm = init?.body instanceof FormData
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init?.headers : { 'content-type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) {
    // TODO(1주차): session-context를 null로 갱신 → 라우트 가드가 /login 유도
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) detail = ` — ${body.error}`
    } catch { /* 본문 없는 에러 무시 */ }
    throw new ApiError(res.status, `API ${res.status}${detail}`)
  }
  return res.json() as Promise<T>
}
