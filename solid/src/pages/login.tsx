import { useLocation, useNavigate } from "@solidjs/router";
import { Show, createMemo } from "solid-js";
import { GoogleIcon } from "../components/icons";
import { PolicyLinks } from "../components/layout";

const MESSAGES: Record<string, string> = {
  denied: "정토회 계정(@jungto.org)으로 로그인해주세요.",
  deactivated: "탈퇴 처리된 계정이에요. 관리자에게 문의해주세요.",
  unavailable:
    "로그인 상태를 확인할 수 없어요. 연결 상태를 확인하고 다시 시도해주세요.",
};

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const error = createMemo(() => {
    const code = new URLSearchParams(location.search).get("error");
    return code ? MESSAGES[code] : "";
  });

  return (
    <main class="flex flex-1 flex-col items-center justify-center px-6 py-8">
      <div class="w-full max-w-[340px]">
        <div class="flex flex-col items-center text-center">
          <img
            src="./logo.png"
            alt=""
            class="h-10 w-10 rounded-card sm:h-12 sm:w-12"
          />
          <h1 class="mt-3 text-page-title font-bold tracking-[-0.015em] text-ink-1">
            물품 대여
          </h1>
          <p class="mt-2 max-w-[280px] text-body leading-[1.5] text-ink-2">
            필요한 물건을 빌리고,
            <br />
            다 쓰면 돌려주세요.
          </p>
        </div>

        <button
          type="button"
          class="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded-card border border-line-strong bg-surface px-4 text-body font-medium text-ink-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => navigate("/signup-profile")}
        >
          <GoogleIcon class="h-[18px] w-[18px] flex-none" />
          Google로 계속하기
        </button>

        <Show when={error() !== ""}>
          <p class="mt-3 text-center text-fine text-danger" role="alert">
            {error()}
          </p>
        </Show>

        <Show when={error() === ""}>
          <p class="mt-4 text-center text-fine leading-[1.5] text-ink-2">
            정토회 계정(@jungto.org)으로 로그인하면
            <br />
            바로 회원이 돼요.
          </p>
        </Show>
      </div>

      <div class="mt-10">
        <PolicyLinks />
      </div>
    </main>
  );
}
