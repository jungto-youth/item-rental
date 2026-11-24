// 로그인·프로필 등록 뒤 돌아갈 화면 경로.
// 같은 출처의 화면 경로만 허용한다 — 외부 URL·프로토콜 상대 URL·API 경로는 fallback.
export function nextPathFromSearch(
  search = window.location.search,
  fallback = "/",
): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    if (url.pathname === "/login" || url.pathname.startsWith("/api/")) {
      return fallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
