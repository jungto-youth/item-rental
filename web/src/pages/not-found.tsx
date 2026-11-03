import { goBack, navigate } from "../router";
import { BoxIcon } from "../components/icons";
import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <div class="page-not-found box-border flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center">
      <span class="flex size-14 items-center justify-center rounded-pill bg-surface-muted text-ink-3 [&_svg]:size-7" aria-hidden="true">
        <BoxIcon />
      </span>

      <p class="mt-4 text-fine font-semibold text-primary-strong">404</p>
      <h1 class="mt-2 text-page-title font-bold tracking-tight text-ink-1">페이지를 찾을 수 없어요</h1>
      <p class="mt-2 max-w-[320px] text-body leading-normal text-ink-2">
        주소가 바뀌었거나 삭제된 페이지예요.
        <br />
        물품 현황으로 돌아가 볼까요?
      </p>

      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => navigate("/")}>
          물품 현황으로
        </Button>
        <Button variant="secondary" onClick={goBack}>
          이전으로
        </Button>
      </div>
    </div>
  );
}
