import { cart } from "../../../context/cart";

// 장바구니 하단 바 — 물품 현황에서 담은 뒤 바로 신청 화면으로 이어진다.
// 담긴 것이 없으면 아예 그리지 않는다 (레이아웃이 홈에서만 보여 준다).
export function CartBar() {
  return (
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
      <div class="mx-auto flex w-full max-w-layout items-center gap-3">
        <p
          class="m-0 min-w-0 flex-1 text-fine font-semibold text-ink-1"
          aria-live="polite"
        >
          장바구니 {cart.count()}종
          <span class="ml-2 font-normal text-ink-2 tabular-nums">
            {cart.totalQty()}개
          </span>
        </p>
        <a
          class="inline-flex h-10 shrink-0 items-center rounded-card border border-primary-strong bg-primary-strong px-3 text-14 font-semibold whitespace-nowrap text-white no-underline hover:border-primary-deep hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
          href="/cart"
        >
          신청하기
        </a>
      </div>
    </div>
  );
}
