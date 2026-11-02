import { Show, type ParentComponent } from "solid-js";
import { useAppStore } from "../store";
import { btnSecondary } from "./ui";

export const AdminGuard: ParentComponent = (props) => {
  const store = useAppStore();

  return (
    <Show
      when={store.isAdmin()}
      fallback={
        <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          <section
            class="mx-auto mt-12 max-w-[520px] rounded-card border border-line bg-surface px-6 py-8 text-center"
            role="status"
          >
            <h1 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
              관리자 권한이 필요해요
            </h1>
            <p class="mt-2 text-body leading-[1.5] text-ink-2">
              일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.
            </p>
            <button
              type="button"
              class={`${btnSecondary} mt-5`}
              onClick={() => store.setRole("admin")}
            >
              관리자로 보기
            </button>
          </section>
        </main>
      }
    >
      {props.children}
    </Show>
  );
};
