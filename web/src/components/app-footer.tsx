import { APP_NAME } from "../brand";

export function AppFooter(props: { surface?: boolean }) {
  return (
    <footer
      class={`border-t border-line ${props.surface ? "bg-surface" : ""}`}
    >
      <div class="mx-auto flex max-w-layout flex-col gap-2 px-4 py-6 text-fine text-ink-2 sm:flex-row sm:items-center sm:justify-between md:px-6 md:py-8">
        <p class="m-0">{APP_NAME}</p>
        <nav class="flex flex-wrap gap-4" aria-label="사이트 정보">
          <a
            class="text-ink-2 no-underline hover:text-ink-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/policy/terms"
          >
            이용약관
          </a>
          <a
            class="text-ink-2 no-underline hover:text-ink-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/policy/privacy"
          >
            개인정보 처리방침
          </a>
          <a
            class="text-ink-2 no-underline hover:text-ink-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/design"
          >
            디자인 시스템
          </a>
        </nav>
      </div>
    </footer>
  );
}
