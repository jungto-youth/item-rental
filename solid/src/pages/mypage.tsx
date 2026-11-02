import { A, useLocation } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { CheckIcon } from "../components/icons";
import {
  SideCard,
  btnPrimarySmall,
  btnSecondarySmall,
  inputClass,
} from "../components/ui";
import { useAppStore } from "../store";

export default function MyPage() {
  const store = useAppStore();
  const location = useLocation();
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal("");
  const [missingPhone, setMissingPhone] = createSignal(
    new URLSearchParams(location.search).get("nophone") === "1",
  );
  const [name, setName] = createSignal(store.state.user.name);
  const [phone, setPhone] = createSignal(
    store.state.user.phone ?? "",
  );

  const initial = () =>
    (store.state.user.name.charAt(0) || "?").toUpperCase();
  const displayPhone = () =>
    missingPhone() ? "미등록" : (store.state.user.phone ?? "미등록");

  const startEdit = () => {
    setName(store.state.user.name);
    setPhone(missingPhone() ? "" : (store.state.user.phone ?? ""));
    setError("");
    setSaved(false);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = (event: SubmitEvent) => {
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
    setMissingPhone(false);
    setEditing(false);
    setSaved(true);
    setError("");
  };

  return (
    <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <div>
        <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
          내 정보
        </h1>
        <p class="mt-2 text-fine text-ink-2">계정 정보와 연락처를 관리해요.</p>
      </div>

      <Show when={missingPhone()}>
        <div class="mt-4 flex flex-col gap-2 rounded-card border border-line bg-primary-soft px-4 py-3 text-fine text-primary-strong sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <p>물품을 대여하려면 연락처를 등록해야 해요.</p>
          <button
            type="button"
            class="flex-none self-start font-semibold underline underline-offset-2 transition-colors hover:text-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={startEdit}
          >
            연락처 등록하기
          </button>
        </div>
      </Show>

      <div class="page-split mt-6">
        <div class="page-main">
          <section>
            <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
              계정 정보
            </h2>

            <div class="mt-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
              <Show
                when={!editing()}
                fallback={
                  <form onSubmit={save}>
                    <div class="flex items-center gap-3">
                      <span
                        class="flex h-12 w-12 flex-none items-center justify-center rounded-pill bg-primary-soft text-body font-semibold text-primary-strong"
                        aria-hidden="true"
                      >
                        {initial()}
                      </span>
                      <div>
                        <p class="text-body font-semibold text-ink-1">
                          계정 정보 수정
                        </p>
                        <p class="mt-1 text-fine text-ink-2">
                          이메일은 변경할 수 없어요.
                        </p>
                      </div>
                    </div>

                    <div class="mt-4 flex items-center justify-between gap-4 rounded-card bg-surface-muted px-4 py-2 text-fine">
                      <span class="text-ink-2">이메일</span>
                      <span class="truncate text-ink-1">
                        {store.state.user.email}
                      </span>
                    </div>

                    <label class="mt-4 block">
                      <span class="text-fine font-medium text-ink-2">
                        이름 <span class="text-danger">*</span>
                      </span>
                      <input
                        autocomplete="name"
                        value={name()}
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
                        value={phone()}
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

                    <div class="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        class={btnSecondarySmall}
                        onClick={cancel}
                      >
                        취소
                      </button>
                      <button type="submit" class={btnPrimarySmall}>
                        저장
                      </button>
                    </div>
                  </form>
                }
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="flex h-12 w-12 flex-none items-center justify-center rounded-pill bg-primary-soft text-body font-semibold text-primary-strong"
                      aria-hidden="true"
                    >
                      {initial()}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-body font-semibold text-ink-1">
                        {store.state.user.name}
                      </p>
                      <p class="mt-1 text-fine text-ink-2">정토회</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class={`${btnSecondarySmall} flex-none`}
                    onClick={startEdit}
                  >
                    수정
                  </button>
                </div>

                <dl class="mt-6 divide-y divide-line border-t border-line">
                  <div class="flex items-center justify-between gap-4 py-2">
                    <dt class="text-fine text-ink-2">이메일</dt>
                    <dd class="truncate text-body text-ink-1">
                      {store.state.user.email}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4 py-2">
                    <dt class="text-fine text-ink-2">연락처</dt>
                    <dd class="text-body tabular-nums text-ink-1">
                      {displayPhone()}
                    </dd>
                  </div>
                </dl>

                <Show when={saved()}>
                  <p
                    class="mt-3 flex items-center gap-1 text-fine text-ink-2"
                    role="status"
                  >
                    <CheckIcon class="h-4 w-4 text-primary-strong" />
                    저장했어요
                  </p>
                </Show>
              </Show>
            </div>
          </section>
        </div>

        <aside class="page-side page-side-hide" aria-label="계정 안내">
          <SideCard title="대여 현황">
            <p>
              대여 중인 물품은{" "}
              <b class="font-semibold text-ink-1">대여 내역</b>에서 확인할 수
              있어요.
            </p>
            <div class="mt-4">
              <A href="/my-rentals" class={btnSecondarySmall}>
                대여 내역 보기
              </A>
            </div>
          </SideCard>
          <SideCard title="연락처 안내">
            연락처는 물품 대여·반납 안내에만 사용해요. 번호가 바뀌면 내 정보에서
            수정해 주세요.
          </SideCard>
        </aside>
      </div>
    </main>
  );
}
