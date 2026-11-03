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
    <div class="page-signup-profile">
      <Show when={ready()}>
        <div class="stage">
          <div class="head">
            <h1>반가워요</h1>
            <p class="sub">물품을 빌리려면 이름과 연락처가 필요해요.</p>
          </div>

          <ProfileForm
            initialName={name()}
            initialPhone={phone()}
            email={email()}
            accountLabel="로그인한 계정"
            accountVerified
            hint=""
            note="저장하면 바로 물품을 둘러볼 수 있어요."
            onSaved={() => navigate("/mypage")}
          />

          <p class="privacy">입력한 정보는 물품 대여 연락에만 사용해요.</p>

          <p class="alt">
            <a href="/login">다른 계정으로 로그인</a>
          </p>

          <nav class="policy" aria-label="정책">
            <a href="/policy/terms">이용약관</a>
            <span aria-hidden="true">·</span>
            <a href="/policy/privacy">개인정보처리방침</a>
          </nav>
        </div>
      </Show>
    </div>
  );
}
