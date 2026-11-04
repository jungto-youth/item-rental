import { Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { navigate } from "../router";
import { ProfileForm } from "../components/common/profile-form";

export default function SignupProfile() {
  const [name, setName] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [affiliation, setAffiliation] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [ready, setReady] = createSignal(false);

  // 구글 계정에 이름이 있으면 전화번호만 받는다 — 연락처 미등록 회원의 공통 진입 화면.
  const hasName = () => name().trim().length > 0;

  onSettled(() => {
    void session.ensure().then((user) => {
      setName(user?.name ?? "");
      setPhone(user?.phone ?? "");
      setAffiliation(user?.affiliation ?? "");
      setEmail(user?.email ?? "");
      setReady(true);
    });
  });

  return (
    <div class="box-border flex min-h-dvh items-center justify-center px-6 py-8">
      <Show when={ready()}>
        <div class="w-full max-w-[340px]">
          <div class="text-center">
            <h1 class="m-0 text-page-title font-bold tracking-tight text-ink-1">
              {hasName() ? "연락처와 소속을 등록해 주세요" : "반가워요"}
            </h1>
            <p class="mt-2 text-body leading-normal text-ink-2">
              {hasName()
                ? "물품을 빌리려면 전화번호와 지회·모둠이 필요합니다."
                : "물품을 빌리려면 이름, 전화번호, 지회·모둠이 필요합니다."}
            </p>
          </div>

          <ProfileForm
            class="mt-6"
            initialName={name()}
            initialPhone={phone()}
            initialAffiliation={affiliation()}
            email={email()}
            accountLabel="로그인한 계정"
            accountVerified
            hint=""
            note="저장하면 바로 물품을 둘러볼 수 있습니다."
            onSaved={() => navigate("/mypage")}
          />

          <p class="mt-4 text-center text-fine leading-normal text-ink-2">
            입력한 정보는 물품 대여 연락에만 사용합니다.
            <br />
            가입은 회원으로 시작하고, 관리자 지정은 기존 관리자가 합니다.
          </p>

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
