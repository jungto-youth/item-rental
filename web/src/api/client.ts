// fetch 래퍼 — 서버 API 계약.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 서버가 본문 {error}로 돌려준 기계용 코드 — 화면 분기는 이 값으로 */
    readonly code?: string,
  ) {
    super(message);
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const timeoutMs = isForm ? 60_000 : 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: isForm
        ? init?.headers
        : { "content-type": "application/json", ...init?.headers },
    });
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof DOMException && err.name === "AbortError"
        ? "요청이 오래 걸려 중단되었습니다 — 잠시 후 다시 시도해 주세요"
        : "네트워크에 연결할 수 없습니다 — 연결 상태를 확인해 주세요",
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) {
    let code = "";
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {
        code = body.error;
        detail = ` — ${body.error}`;
      }
    } catch {
      /* 본문 없는 에러 무시 */
    }
    throw new ApiError(res.status, `API ${res.status}${detail}`, code || undefined);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, "서버 응답이 올바른 JSON이 아닙니다");
  }
}
