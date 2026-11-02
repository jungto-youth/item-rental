import { For, Show, createMemo, createSignal } from "solid-js";
import { AdminGuard } from "../components/admin-guard";
import { ChevronDownIcon, SearchIcon } from "../components/icons";
import {
  ConfirmModal,
  PageMessage,
  SideCard,
  StatusBadge,
  btnDanger,
  btnPrimary,
  inputClass,
} from "../components/ui";
import { useAppStore } from "../store";
import type { Member } from "../types";

type PendingAction = {
  id: string;
  name: string;
  action: "withdraw" | "delete";
};

const roleButton =
  "h-9 flex-none rounded-card border border-danger bg-surface px-4 text-body font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export default function AdminMembers() {
  const store = useAppStore();
  const [query, setQuery] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal<PendingAction | null>(null);
  const [email, setEmail] = createSignal("");
  const [emailNote, setEmailNote] = createSignal("");
  const [emailError, setEmailError] = createSignal("");

  const activeAdmins = createMemo(
    () =>
      store.state.members.filter(
        (member) => member.role === "admin" && !member.deactivated,
      ).length,
  );

  const isLastAdmin = (member: Member) =>
    member.role === "admin" && !member.deactivated && activeAdmins() === 1;

  const searchText = (member: Member) => {
    if (member.infoDeleted) return "등록 정보 삭제됨";
    return `${member.name} ${member.email} ${member.phone ?? "연락처 미등록"}`;
  };

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return store.state.members;
    return store.state.members.filter((member) =>
      searchText(member).toLowerCase().includes(q),
    );
  });

  const showMessage = (text: string) => {
    setMessage(text);
    setError("");
  };

  const changeRole = (
    member: Member,
    value: string,
    select: HTMLSelectElement,
  ) => {
    if (isLastAdmin(member) && value !== "admin") {
      select.value = "admin";
      setError("마지막 관리자는 역할을 바꿀 수 없어요");
      setMessage("");
      return;
    }
    store.setMemberRole(member.id, value === "admin" ? "admin" : "user");
    showMessage(
      `${member.name} 님의 역할을 ${value === "admin" ? "관리자" : "회원"}로 바꿨어요`,
    );
  };

  const confirm = () => {
    const action = pending();
    if (!action) return;
    if (action.action === "withdraw") {
      store.withdrawMember(action.id);
      showMessage(`${action.name} 님을 탈퇴 처리했어요`);
    } else {
      store.deleteMemberInfo(action.id);
      showMessage(`${action.name} 님의 등록 정보를 삭제했어요`);
    }
    setPending(null);
  };

  const addEmail = (event: SubmitEvent) => {
    event.preventDefault();
    const value = email().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("올바른 이메일을 입력해 주세요");
      return;
    }
    store.addAllowedEmail(value, emailNote());
    setEmailError("");
    setEmail("");
    setEmailNote("");
    showMessage(`${value}을(를) 허용 목록에 추가했어요`);
  };

  const removeEmail = (value: string) => {
    store.removeAllowedEmail(value);
    showMessage(`${value}을(를) 허용 목록에서 제거했어요`);
  };

  return (
    <AdminGuard>
      <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        <div>
          <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
            회원 관리
          </h1>
          <p class="mt-2 text-fine text-ink-2">
            회원 역할과 로그인 허용 이메일을 관리해요.
          </p>
        </div>

        <PageMessage show={message() !== ""}>{message()}</PageMessage>
        <Show when={error() !== ""}>
          <p class="mt-3 text-fine text-danger" role="alert">
            {error()}
          </p>
        </Show>

        <div class="page-split mt-6">
          <div class="page-main">
            <div class="relative">
              <SearchIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={query()}
                aria-label="회원 검색"
                placeholder="이름, 이메일, 연락처 검색…"
                onInput={(event) => setQuery(event.currentTarget.value)}
                class="h-10 w-full rounded-card border border-line bg-surface pl-10 pr-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Show
              when={filtered().length > 0}
              fallback={
                <div class="mt-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
                  <p class="text-body font-semibold text-ink-1">
                    검색 결과가 없어요
                  </p>
                  <p class="mt-2 text-fine text-ink-2">
                    다른 이름이나 연락처로 검색해 보세요.
                  </p>
                </div>
              }
            >
              <div class="mt-4 space-y-2">
                <For each={filtered()}>
                  {(member) => (
                    <article class="rounded-card border border-line bg-surface p-4">
                      <div class="flex flex-wrap items-start gap-3">
                        <div class="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            class={`flex h-9 w-9 flex-none items-center justify-center rounded-pill text-fine font-semibold ${
                              member.deactivated || member.infoDeleted
                                ? "bg-surface-muted text-ink-2"
                                : "bg-primary-soft text-primary-strong"
                            }`}
                            aria-hidden="true"
                          >
                            {member.infoDeleted
                              ? "—"
                              : member.name.charAt(0).toUpperCase()}
                          </span>
                          <div class="min-w-0">
                            <div class="flex min-w-0 items-center gap-2">
                              <p class="min-w-0 truncate text-body font-semibold text-ink-1">
                                {member.name}
                              </p>
                              <Show when={member.deactivated}>
                                <span class="flex-none">
                                  <StatusBadge>탈퇴</StatusBadge>
                                </span>
                              </Show>
                            </div>
                            <p class="mt-1 truncate text-fine text-ink-2">
                              {member.infoDeleted
                                ? "등록 정보 삭제됨"
                                : `${member.email} · ${member.phone ?? "연락처 미등록"}`}
                            </p>
                          </div>
                        </div>

                        <Show
                          when={!member.deactivated}
                          fallback={
                            <Show when={!member.infoDeleted}>
                              <div class="flex w-full items-center gap-2 sm:w-auto">
                                <button
                                  type="button"
                                  disabled={member.activeRentals > 0}
                                  title={
                                    member.activeRentals > 0
                                      ? "대여 중인 물품이 있어요"
                                      : undefined
                                  }
                                  class={`${roleButton} disabled:cursor-not-allowed disabled:opacity-40`}
                                  onClick={() =>
                                    setPending({
                                      id: member.id,
                                      name: member.name,
                                      action: "delete",
                                    })
                                  }
                                >
                                  등록 정보 삭제
                                </button>
                              </div>
                            </Show>
                          }
                        >
                          <div class="flex w-full items-center gap-2 sm:w-auto">
                            <span class="relative inline-flex flex-1 items-center sm:flex-none">
                              <select
                                class="role-select w-full"
                                aria-label="역할 지정"
                                value={member.role}
                                onChange={(event) =>
                                  changeRole(
                                    member,
                                    event.currentTarget.value,
                                    event.currentTarget,
                                  )
                                }
                              >
                                <option value="user">회원</option>
                                <option value="admin">관리자</option>
                              </select>
                              <ChevronDownIcon class="pointer-events-none absolute right-3 h-3 w-3 text-ink-3" />
                            </span>
                            <button
                              type="button"
                              disabled={isLastAdmin(member)}
                              title={
                                isLastAdmin(member)
                                  ? "마지막 관리자는 탈퇴할 수 없어요"
                                  : undefined
                              }
                              class={`${roleButton} disabled:cursor-not-allowed disabled:opacity-40`}
                              onClick={() =>
                                setPending({
                                  id: member.id,
                                  name: member.name,
                                  action: "withdraw",
                                })
                              }
                            >
                              탈퇴
                            </button>
                          </div>
                        </Show>
                      </div>

                      <Show when={isLastAdmin(member)}>
                        <p class="mt-2 text-fine text-ink-2">
                          마지막 관리자는 탈퇴할 수 없어요.
                        </p>
                      </Show>
                      <Show
                        when={
                          member.deactivated &&
                          !member.infoDeleted &&
                          member.activeRentals > 0
                        }
                      >
                        <p class="mt-2 text-fine text-ink-2">
                          대여 중 {member.activeRentals}건 · 등록 정보 삭제 전
                          반납 또는 취소 처리가 필요해요.
                        </p>
                      </Show>
                    </article>
                  )}
                </For>
              </div>
            </Show>

            <details class="mt-8">
              <summary class="plain-summary flex cursor-pointer items-center justify-between gap-4">
                <span class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
                  로그인 허용 이메일
                </span>
                <ChevronDownIcon class="chevron h-5 w-5 flex-none text-ink-2 transition-transform" />
              </summary>

              <p class="mt-2 text-fine text-ink-2">
                정토회(@jungto.org) 계정 외에 로그인을 허용할 이메일입니다.
              </p>

              <div class="mt-4 rounded-card border border-line bg-surface p-4">
                <form onSubmit={addEmail} novalidate>
                  <div class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label class="block">
                      <span class="text-fine font-medium text-ink-2">
                        이메일
                      </span>
                      <input
                        type="email"
                        autocomplete="off"
                        placeholder="oper@example.com"
                        value={email()}
                        class={`${inputClass} mt-2 ${emailError() ? "is-invalid" : ""}`}
                        onInput={(event) => {
                          setEmail(event.currentTarget.value);
                          setEmailError("");
                        }}
                      />
                    </label>
                    <label class="block">
                      <span class="text-fine font-medium text-ink-2">
                        메모 (선택)
                      </span>
                      <input
                        type="text"
                        autocomplete="off"
                        placeholder="누구 계정인지"
                        value={emailNote()}
                        class={`${inputClass} mt-2`}
                        onInput={(event) =>
                          setEmailNote(event.currentTarget.value)
                        }
                      />
                    </label>
                    <button
                      type="submit"
                      class={`${btnPrimary} w-full sm:w-auto`}
                    >
                      추가
                    </button>
                  </div>
                  <Show when={emailError() !== ""}>
                    <p class="mt-2 text-fine text-danger" role="alert">
                      {emailError()}
                    </p>
                  </Show>
                </form>
              </div>

              <Show
                when={store.state.allowedEmails.length > 0}
                fallback={
                  <div class="mt-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
                    <p class="text-body font-semibold text-ink-1">
                      아직 등록된 이메일이 없어요
                    </p>
                    <p class="mt-2 text-fine text-ink-2">
                      로그인을 허용할 이메일을 추가해 보세요.
                    </p>
                  </div>
                }
              >
                <div class="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
                  <For each={store.state.allowedEmails}>
                    {(row) => (
                      <div class="flex flex-wrap items-center gap-3 p-4">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-body font-medium text-ink-1">
                            {row.email}
                          </p>
                          <p class="mt-1 text-fine text-ink-2">
                            {row.note ? `${row.note} · ` : ""}등록:{" "}
                            {row.addedBy} · {row.addedAt}
                          </p>
                        </div>
                        <button
                          type="button"
                          class={btnDanger}
                          onClick={() => removeEmail(row.email)}
                        >
                          제거
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </details>
          </div>

          <aside class="page-side page-side-hide" aria-label="회원 관리 안내">
            <SideCard title="역할 안내">
              <b class="font-semibold text-ink-1">회원</b>은 물품을 찾아
              대여하고 반납해요. <b class="font-semibold text-ink-1">관리자</b>
              는 물품 등록·수정과 회원 관리, 반납 처리를 맡아요.
            </SideCard>
            <SideCard title="마지막 관리자 보호">
              마지막 남은 관리자는 역할을 바꾸거나 탈퇴시킬 수 없어요. 탈퇴
              회원이라도 대여 중인 물품이 있으면 등록 정보를 삭제할 수 없어요.
            </SideCard>
          </aside>
        </div>

        <ConfirmModal
          open={pending() !== null}
          title={
            pending()?.action === "withdraw"
              ? `'${pending()?.name}' 님을 탈퇴 처리할까요?`
              : `'${pending()?.name}' 님의 등록 정보를 삭제할까요?`
          }
          description={
            pending()?.action === "withdraw"
              ? "탈퇴하면 계정 접근이 차단되고, 대여·관리 이력은 익명으로 보존돼요."
              : "이름·이메일·연락처가 제거되고, 완료된 대여·관리 이력은 익명으로 보존돼요. 되돌릴 수 없어요."
          }
          confirmLabel={
            pending()?.action === "withdraw" ? "탈퇴" : "등록 정보 삭제"
          }
          cancelLabel="닫기"
          danger
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      </main>
    </AdminGuard>
  );
}
