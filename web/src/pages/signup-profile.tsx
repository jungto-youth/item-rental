import { Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { navigate } from "../router";
import { ProfileForm } from "../components/common/profile-form";

export default function SignupProfile() {
  const [name, setName] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [ready, setReady] = createSignal(false);

  onSettled(() => {
    void session.ensure().then((user) => {
      setName(user?.name ?? "");
      setPhone(user?.phone ?? "");
      setEmail(user?.email ?? "");
      setReady(true);
    });
  });

  return (
    <div class="box-border flex min-h-dvh items-center justify-center px-6 py-8">
      <Show when={ready()}>
        <div class="w-full max-w-[340px]">
          <div class="text-center">
            <h1 class="m-0 text-page-title font-bold tracking-tight text-ink-1">반가워요</h1>
            <p class="mt-2 text-body leading-normal text-ink-2">물품을 빌리려면 이름과 연락처가 필요해요.</p>
          </div>

          <ProfileForm
            class="mt-6"
            initialName={name()}
            initialPhone={phone()}
            email={email()}
            accountLabel="로그인한 계정"
            accountVerified
            hint=""
            note="저장하면 바로 물품을 둘러볼 수 있어요."
            onSaved={() => navigate("/mypage")}
          />

          <p class="mt-4 text-center text-fine text-ink-2">입력한 정보는 물품 대여 연락에만 사용해요.</p>

          <p class="mt-6 text-center">
            <a class="text-fine text-ink-2 no-underline hover:text-ink-1 hover:underline" href="/login">다른 계정으로 로그인</a>
          </p>

          <nav class="mt-4 flex justify-center gap-4 text-fine text-ink-3" aria-label="정책">
            <a class="text-fine text-ink-2 no-underline hover:text-ink-1 hover:underline" href="/policy/terms">이용약관</a>
            <span aria-hidden="true">·</span>
            <a class="text-fine text-ink-2 no-underline hover:text-ink-1 hover:underline" href="/policy/privacy">개인정보 처리방침</a>
          </nav>
        </div>
      </Show>
    </div>
  );
}
