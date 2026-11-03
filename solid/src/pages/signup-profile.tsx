import { useNavigate } from "@solidjs/router";
import { Link } from "../components/link";
import { Show, createSignal } from "solid-js";
import { CheckIcon } from "../components/icons";
import { PolicyLinks } from "../components/layout";
import { btnPrimary, inputClass } from "../components/ui";
import { useAppStore } from "../store";

export default function SignupProfile() {
  const store = useAppStore();
  const navigate = useNavigate();
  const [name, setName] = createSignal("김하늘");
  const [phone, setPhone] = createSignal("");
  const [error, setError] = createSignal("");

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const nameValue = name().trim();
    const phoneValue = phone().trim();

    if (!nameValue || !phoneValue) {
      setError(
        !nameValue && !phoneValue
          ? "이름과 연락처를 모두 입력해 주세요"
          : !nameValue
            ? "이름을 입력해 주세요"
            : "연락처를 입력해 주세요",
      );
      return;
    }

    store.updateUser(nameValue, phoneValue);
    navigate("/mypage");
  };

  return (
    <main class="flex flex-1 flex-col items-center px-6 py-8">
      <div class="my-auto w-full max-w-[340px]">
        <div class="text-center">
          <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
            반가워요
          </h1>
          <p class="mt-2 text-body leading-[1.5] text-ink-2">
            물품을 빌리려면 이름과 연락처가 필요해요.
          </p>
        </div>

        <form
          class="mt-6 rounded-card border border-line bg-surface p-6 max-sm:p-4"
          onSubmit={submit}
        >
          <div class="mb-4 flex items-center gap-2 rounded-card bg-surface-muted px-4 py-2 text-fine">
            <CheckIcon class="h-4 w-4 flex-none text-primary-strong" />
            <span class="text-ink-2">로그인한 계정</span>
            <span class="ml-auto truncate text-ink-1">
              {store.state.user.email}
            </span>
          </div>

          <label class="block">
            <span class="text-fine font-medium text-ink-2">
              이름 <span class="text-danger">*</span>
            </span>
            <input
              autocomplete="name"
              value={name()}
              aria-required="true"
              class={`${inputClass} mt-2 ${error() && !name().trim() ? "is-invalid" : ""}`}
              onInput={(event) => {
                setName(event.currentTarget.value);
                if (name().trim() && phone().trim()) setError("");
              }}
            />
          </label>

          <label class="mt-4 block">
            <span class="text-fine font-medium text-ink-2">
              휴대폰 번호 <span class="text-danger">*</span>
            </span>
            <input
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="010-1234-5678"
              value={phone()}
              aria-required="true"
              class={`${inputClass} mt-2 ${error() && !phone().trim() ? "is-invalid" : ""}`}
              onInput={(event) => {
                setPhone(event.currentTarget.value);
                if (name().trim() && phone().trim()) setError("");
              }}
            />
          </label>

          <Show when={error() !== ""}>
            <p class="mt-2 text-fine text-danger" role="alert">
              {error()}
            </p>
          </Show>

          <button type="submit" class={`${btnPrimary} mt-6 w-full`}>
            저장
          </button>
          <p class="mt-2 text-center text-fine text-ink-2">
            저장하면 바로 물품을 둘러볼 수 있어요.
          </p>
        </form>

        <p class="mt-4 text-center text-fine text-ink-2">
          입력한 정보는 물품 대여 연락에만 사용해요.
        </p>

        <div class="mt-6 text-center">
          <Link
            href="/login"
            class="text-fine text-ink-2 transition-colors hover:text-ink-1 hover:underline"
          >
            다른 계정으로 로그인
          </Link>
        </div>

        <div class="mt-4">
          <PolicyLinks />
        </div>
      </div>
    </main>
  );
}
