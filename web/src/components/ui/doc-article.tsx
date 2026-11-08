import type { JSX } from "@solidjs/web";

// 정책 문서 본문의 타이포를 한 곳에서 정의한다.
// 두 문서가 같은 arbitrary 클래스 문자열을 복붙하지 않도록 DocArticle로 감싼다.
const DOC_ARTICLE_CLASS =
  "max-w-[680px] min-w-0 text-body leading-[1.75] " +
  "[&>h2]:mt-8 [&>h2:first-child]:mt-0 [&>h2]:scroll-mt-24 [&>h2]:text-heading [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:leading-[1.4] [&>h2]:text-ink-1 " +
  "[&>h2+p]:mt-6 [&>h2+ul]:mt-6 [&>h2+div]:mt-6 " +
  "[&>p]:mt-4 [&>p]:text-ink-2 " +
  "[&>ul]:mt-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:text-ink-2 [&>ul>li+li]:mt-2 " +
  "[&_b]:font-semibold [&_b]:text-ink-1 " +
  "[&_table]:w-full [&_table]:min-w-[420px] [&_table]:border-collapse [&_table]:text-fine [&_table]:leading-[1.75] [&_th]:border [&_th]:border-line [&_th]:bg-surface-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink-1 [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:text-left [&_td]:text-ink-2";

export function DocArticle(props: { label: string; children: JSX.Element }) {
  return (
    <article aria-label={props.label} class={DOC_ARTICLE_CLASS}>
      {props.children}
    </article>
  );
}

export function DocTable(props: { children: JSX.Element }) {
  return (
    <div class="mt-4">
      <div class="overflow-x-auto [scrollbar-width:thin]">
        <table>{props.children}</table>
      </div>
      <p class="mt-2 text-fine text-ink-2 sm:hidden">
        표는 좌우로 넘겨서 볼 수 있습니다.
      </p>
    </div>
  );
}
