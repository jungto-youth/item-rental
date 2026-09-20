// SPEC §7.2 — fetch 래퍼 (401 처리는 1주차 인증 플로우에서 확장)
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 서버가 본문 {error}로 돌려준 기계용 코드 — 화면 분기는 이 값으로 (메시지 문자열 파싱 금지) */
    readonly code?: string,
  ) {
    super(message);
  }
}

// 401 알림 훅 — client가 router를 import하면 순환(router→session→client)이 생기므로 주입받는다
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData(사진 업로드)는 브라우저가 multipart boundary를 자동 지정하게 둬야 함 — content-type 수동 지정 금지
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm
      ? init?.headers
      : { "content-type": "application/json", ...init?.headers },
  });
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
    throw new ApiError(
      res.status,
      `API ${res.status}${detail}`,
      code || undefined,
    );
  }
  // 204·빈 본문은 파싱할 JSON이 없다 — res.json()이 던지면 성공한 작업이 실패로 표시된다
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // 성공 응답도 프록시 에러 페이지 등 HTML 이 올 수 있다 — JSON.parse를 그대로 던지면
  // 호출부가 SyntaxError 를 받으므로 ApiError 로 감싼다
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, "서버 응답이 올바른 JSON이 아닙니다");
  }
}
