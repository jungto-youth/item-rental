import { Link } from "../components/link";
import { PackageIcon } from "../components/icons";
import { btnPrimary, btnSecondary } from "../components/ui";

export default function NotFound() {
  return (
    <main class="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span
        class="flex h-14 w-14 items-center justify-center rounded-pill bg-surface-muted text-ink-3"
        aria-hidden="true"
      >
        <PackageIcon class="h-7 w-7" />
      </span>

      <p class="mt-4 text-fine font-semibold text-primary-strong">404</p>
      <h1 class="mt-2 text-page-title font-bold tracking-[-0.015em] text-ink-1">
        페이지를 찾을 수 없어요
      </h1>
      <p class="mt-2 max-w-[320px] text-body leading-[1.5] text-ink-2">
        주소가 바뀌었거나 삭제된 페이지예요.
        <br />
        물품 현황으로 돌아가 볼까요?
      </p>

      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" class={btnPrimary}>
          물품 현황으로
        </Link>
        <button
          type="button"
          class={btnSecondary}
          onClick={() => history.back()}
        >
          이전으로
        </button>
      </div>
    </main>
  );
}
