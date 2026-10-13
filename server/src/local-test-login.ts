// Only `dev:lan` supplies this compile-time flag. Normal dev/deploy leaves it unset.
declare const LOCAL_TEST_LOGIN: boolean;

export const LOCAL_TEST_ADMIN_ID = "local-photo-test-admin";

export function localTestLoginEnabled(request: Request): boolean {
  if (typeof LOCAL_TEST_LOGIN === "undefined" || LOCAL_TEST_LOGIN !== true) return false;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "[::1]") return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
