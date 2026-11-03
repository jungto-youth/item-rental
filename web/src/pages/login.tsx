import { Show, createSignal, onSettled } from "solid-js";
import { api } from "../api/client";
import { Button } from "../components/ui/button";

export default function Login() {
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [localTestLogin, setLocalTestLogin] = createSignal(false);
  const [developmentConfigured, setDevelopmentConfigured] = createSignal(false);
  const [developmentCode, setDevelopmentCode] = createSignal("");

  onSettled(() => {
    void loadLocalTestLogin();
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "AccessDenied") {
      setMessage("정토회 계정(@jungto.org)으로 로그인해주세요");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (error === "AccountDeactivated") {
      setMessage("탈퇴 처리된 계정이에요. 관리자에게 문의해주세요");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (error === "SessionUnavailable") {
      setMessage("로그인 상태를 확인할 수 없어요. 연결 상태를 확인하고 다시 시도해주세요");
      window.history.replaceState(null, "", window.location.pathname);
    }
  });

  const loadLocalTestLogin = async () => {
    try {
      const result = await api<{ enabled: boolean; configured?: boolean }>(
        "/api/dev/login",
      );
      setLocalTestLogin(result.enabled);
      setDevelopmentConfigured(result.configured === true);
    } catch {
      setLocalTestLogin(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const res = await fetch("/api/auth/signin/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: window.location.origin + "/",
        }),
      });
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("로그인 URL을 받지 못했어요");
      window.location.assign(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "로그인에 실패했어요");
      setBusy(false);
    }
  };

  const signInLocalTest = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy() || !developmentConfigured()) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/dev/login", {
        method: "POST",
        body: JSON.stringify({ code: developmentCode() }),
      });
      setDevelopmentCode("");
      window.location.assign("/");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "테스트 로그인에 실패했어요");
      setBusy(false);
    }
  };

  return (
    <div class="page-login">
      <div class="stage">
        <div class="card">
          <div class="brand">
            <img class="logo" src="/logo.png" alt="" />
            <h1>물품 대여</h1>
            <p class="sub">
              필요한 물건을 빌리고,
              <br />
              다 쓰면 돌려주세요.
            </p>
          </div>

          <button class="google" type="button" disabled={busy()} onClick={() => void signIn()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v2.98h3.88c2.27-2.09 3.54-5.17 3.54-8.8Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.95-2.93l-3.88-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
              />
            </svg>
            {busy() ? "이동 중…" : "Google로 계속하기"}
          </button>

          <p class="msg" role="alert" aria-live="polite">
            {message()}
          </p>

          <p class={`note ${message() ? "hidden" : ""}`}>
            정토회 계정(@jungto.org)으로 로그인하면
            <br />
            바로 회원이 돼요.
          </p>

          <Show when={localTestLogin()}>
            <form class="dev" onSubmit={signInLocalTest}>
              <label for="dev-code">
                테스트 접근 코드
                <input
                  id="dev-code"
                  type="password"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  minlength="32"
                  maxlength="128"
                  required
                  placeholder="접근 코드 입력"
                  value={developmentCode()}
                  onInput={(event) => setDevelopmentCode(event.currentTarget.value)}
                />
              </label>
              <Show when={!developmentConfigured()}>
                <p class="msg" role="status">
                  .dev.vars에 무작위 DEV_LOGIN_CODE(32자 이상)를 설정하고 개발 서버를
                  다시 실행해주세요
                </p>
              </Show>
              <Button
                variant="secondary"
                type="submit"
                loading={busy()}
                disabled={!developmentConfigured()}
              >
                로컬 테스트 관리자 로그인
              </Button>
            </form>
          </Show>
        </div>

        <footer>
          <a href="/policy/terms">이용약관</a>
          <span aria-hidden="true">·</span>
          <a href="/policy/privacy">개인정보처리방침</a>
        </footer>
      </div>
    </div>
  );
}
