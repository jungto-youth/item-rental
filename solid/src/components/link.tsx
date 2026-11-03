import { useHref } from "@solidjs/router";
import type { JSX } from "@solidjs/web";

/**
 * Router 2 에는 `<A>` 가 없다. 해시 라우팅에서도 새로고침 URL 이 유지되도록
 * `useHref` 로 `#` 접두사를 붙인 평범한 앵커를 쓴다.
 */
export function Link(
  props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
) {
  const href = useHref(() => props.href);
  return <a {...props} href={href()} />;
}
