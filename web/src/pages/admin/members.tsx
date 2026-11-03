import {
  For,
  Show,
  createMemo,
  createSignal,
  onSettled,
  untrack,
} from "solid-js";
import { api, ApiError } from "../../api/client";
import type { AdminMember, AllowedEmail, Role } from "../../types";
import { confirmDialog } from "../../utils/confirm";
import { fmtKstDate } from "../../utils/date";
import { AdminPage } from "../../components/admin/admin-page";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Empty } from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { ChevronDownIcon, SearchIcon } from "../../components/icons";

export default function AdminMembers() {
  const [members, setMembers] = createSignal<AdminMember[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [q, setQ] = createSignal("");
  const [processingKey, setProcessingKey] = createSignal<string | null>(null);

  const [emails, setEmails] = createSignal<AllowedEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = createSignal(true);
  const [emailValue, setEmailValue] = createSignal("");
  const [noteValue, setNoteValue] = createSignal("");
  const [emailBusy, setEmailBusy] = createSignal(false);

  const [message, setMessage] = createSignal("");
  const [messageTone, setMessageTone] = createSignal<"info" | "success" | "error">(
    "info",
  );
  const [error, setError] = createSignal("");

  const reload = async () => {
    setError("");
    try {
      const res = await api<{ members: AdminMember[] }>("/api/admin/members");
      setMembers(res.members);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "회원 목록을 불러오지 못했어요",
      );
    } finally {
      setLoading(false);
    }
  };

  const reloadEmails = async () => {
    try {
      const res = await api<{ allowedEmails: AllowedEmail[] }>(
        "/api/admin/allowed-emails",
      );
      setEmails(res.allowedEmails);
    } catch {
      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  };

  onSettled(() => {
    void Promise.all([reload(), reloadEmails()]);
  });

  const filtered = createMemo(() => {
    const query = q().trim().toLowerCase();
    if (!query) return members();
    return members().filter((member) =>
      `${member.name ?? ""} ${member.email} ${member.phone ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  });

  const activeAdminCount = createMemo(
    () =>
      members().filter(
        (member) => !member.deactivated_at && member.role === "admin",
      ).length,
  );

  const isLastAdmin = (member: AdminMember) =>
    !member.deactivated_at &&
    member.role === "admin" &&
    activeAdminCount() <= 1;

  const keyOf = (
    member: AdminMember,
    kind: "role" | "withdraw" | "delete",
  ) => `${member.id}:${kind}`;

  const otherRowBusy = (
    member: AdminMember,
    kind: "role" | "withdraw" | "delete",
  ) => {
    if (!processingKey()) return false;
    return processingKey() !== keyOf(member, kind);
  };

  const withdraw = async (member: AdminMember) => {
    if (processingKey()) return;
    const who = member.name || member.email || "이 회원";
    if (
      !(await confirmDialog("", {
        title: `'${who}' 님을 탈퇴 처리할까요?`,
        description:
          "탈퇴하면 계정 접근이 차단되고, 대여·관리 이력은 익명으로 보존돼요.",
        confirmLabel: "탈퇴",
        danger: true,
      }))
    )
      return;
    if (processingKey()) return;
    setProcessingKey(keyOf(member, "withdraw"));
    try {
      await api(`/api/admin/members/${member.id}/withdraw`, { method: "POST" });
      setMessage(`${who}님을 탈퇴 처리했어요`);
      setMessageTone("success");
      await reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "last_admin") {
        setMessage("마지막 관리자는 탈퇴 처리할 수 없어요");
      } else if (err instanceof ApiError) {
        setMessage(err.message);
      } else {
        setMessage("탈퇴 처리 실패");
      }
      setMessageTone("error");
      await reload();
    } finally {
      setProcessingKey(null);
    }
  };

  const deleteRegistration = async (member: AdminMember) => {
    if (processingKey()) return;
    const who = member.name || member.email;
    if (
      !(await confirmDialog("", {
        title: `'${who}' 님의 등록 정보를 삭제할까요?`,
        description:
          "이름·이메일·연락처가 제거되고, 완료된 대여·관리 이력은 익명으로 보존돼요. 되돌릴 수 없어요.",
        confirmLabel: "등록 정보 삭제",
        danger: true,
      }))
    )
      return;
    if (processingKey()) return;
    setProcessingKey(keyOf(member, "delete"));
    try {
      await api(`/api/admin/members/${member.id}`, { method: "DELETE" });
      setMessage(`${who}님의 등록 정보를 삭제했어요`);
      setMessageTone("success");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setMessage(
        code === "has_active_rentals"
          ? "대여 중인 물품이 있어 삭제할 수 없어요. 먼저 반납 또는 취소 처리해 주세요"
          : code === "active_member"
            ? "활성 회원은 바로 삭제할 수 없어요. 먼저 탈퇴 처리해 주세요"
            : err instanceof Error
              ? err.message
              : "등록 정보 삭제에 실패했어요",
      );
      setMessageTone("error");
    } finally {
      await reload();
      setProcessingKey(null);
    }
  };

  const setRole = async (member: AdminMember, role: Role) => {
    if (role === member.role || processingKey()) return;
    const label: Record<Role, string> = { user: "회원", admin: "관리자" };
    setProcessingKey(keyOf(member, "role"));
    try {
      await api(`/api/admin/members/${member.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      setMessage(
        `${member.name || member.email}님의 역할을 '${label[role]}'(으)로 바꿨어요`,
      );
      setMessageTone("success");
      await reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "last_admin") {
        setMessage("마지막 관리자는 해임할 수 없어요");
      } else if (err instanceof ApiError) {
        setMessage(err.message);
      } else {
        setMessage("역할 변경 실패");
      }
      setMessageTone("error");
      await reload();
    } finally {
      setProcessingKey(null);
    }
  };

  const addEmail = async () => {
    const email = emailValue().trim();
    if (!email || !email.includes("@")) {
      setMessage("이메일 형식을 확인해 주세요");
      setMessageTone("error");
      return;
    }
    if (emailBusy()) return;
    setEmailBusy(true);
    try {
      await api("/api/admin/allowed-emails", {
        method: "POST",
        body: JSON.stringify({
          email,
          note: noteValue().trim() || undefined,
        }),
      });
      setMessage(`${email} 계정의 로그인을 허용했어요`);
      setMessageTone("success");
      setEmailValue("");
      setNoteValue("");
      await reloadEmails();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "duplicate") setMessage("이미 등록된 이메일이에요");
      else if (err instanceof ApiError) setMessage(err.message);
      else setMessage("추가 실패");
      setMessageTone("error");
    } finally {
      setEmailBusy(false);
    }
  };

  const removeEmail = async (email: AllowedEmail) => {
    if (emailBusy()) return;
    setEmailBusy(true);
    try {
      await api(`/api/admin/allowed-emails/${email.id}`, { method: "DELETE" });
      setMessage(`${email.email} 계정을 제거했어요`);
      setMessageTone("success");
      await reloadEmails();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "제거 실패");
      setMessageTone("error");
      await reloadEmails();
    } finally {
      setEmailBusy(false);
    }
  };

  const phoneLine = (member: AdminMember) =>
    member.phone ? (
      <a href={`tel:${member.phone.replace(/[^+\d]/g, "")}`}>{member.phone}</a>
    ) : (
      "연락처 미등록"
    );

  const renderCard = (member: AdminMember) => {
    const withdrawn = !!member.deactivated_at;
    const lastAdmin = untrack(() => isLastAdmin(member));
    const withdrawKey = keyOf(member, "withdraw");
    const initial = (member.name || member.email).trim().charAt(0).toUpperCase();
    const note = lastAdmin
      ? "마지막 관리자는 탈퇴할 수 없어요."
      : withdrawn && (member.active_rental_count ?? 0) > 0
        ? `대여 중 ${member.active_rental_count}건 · 등록 정보 삭제 전 반납 또는 취소 처리가 필요해요.`
        : "";

    return (
      <article class="member box-border min-w-0 rounded-card border border-line bg-surface p-4">
        <div class="flex flex-wrap items-start gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <span class={`flex size-9 shrink-0 items-center justify-center rounded-pill text-fine font-semibold ${withdrawn ? "bg-surface-muted text-ink-2" : "bg-primary-soft text-primary-strong"}`} aria-hidden="true">
              {initial}
            </span>
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <p class="m-0 min-w-0 truncate text-body font-semibold text-ink-1">{member.name || "—"}</p>
                <Show when={withdrawn}>
                  <Badge kind="withdrawn" />
                </Show>
              </div>
              <p class="mt-2 truncate text-fine text-ink-2 [&_a]:text-ink-2 [&_a]:underline [&_a]:underline-offset-2">
                {member.email} · {phoneLine(member)}
              </p>
              <p class="mt-2 truncate text-fine text-ink-2">
                소속: {member.affiliation || "미입력"}
              </p>
            </div>
          </div>

          <div class="flex w-full items-center gap-2 sm:w-auto sm:flex-none">
            <Show
              when={!withdrawn}
              fallback={
                <Button
                  variant="danger"
                  class="w-full sm:w-auto"
                  title={
                    (member.active_rental_count ?? 0) > 0
                      ? "대여 중인 물품이 있어요"
                      : ""
                  }
                  loading={processingKey() === keyOf(member, "delete")}
                  disabled={
                    otherRowBusy(member, "delete") ||
                    (member.active_rental_count ?? 0) > 0
                  }
                  onClick={() => void deleteRegistration(member)}
                >
                  등록 정보 삭제
                </Button>
              }
            >
              <span class="relative inline-flex min-w-0 flex-1 items-center sm:flex-none">
                <select
                  class="h-10 w-full cursor-pointer appearance-none rounded-card border border-line bg-surface px-4 text-body leading-[1.2] text-ink-1 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
                  aria-label="역할 지정"
                  disabled={lastAdmin || otherRowBusy(member, "role")}
                  value={member.role}
                  onChange={(event) =>
                    void setRole(
                      member,
                      event.currentTarget.value as Role,
                    )
                  }
                >
                  <option value="user">회원</option>
                  <option value="admin">관리자</option>
                </select>
                <span class="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-ink-3 [&_svg]:block [&_svg]:size-3" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </span>
              <Button
                variant="danger"
                title={lastAdmin ? "마지막 관리자는 탈퇴할 수 없어요" : ""}
                loading={processingKey() === withdrawKey}
                disabled={lastAdmin || otherRowBusy(member, "withdraw")}
                onClick={() => void withdraw(member)}
              >
                탈퇴
              </Button>
            </Show>
          </div>
        </div>
        <Show when={note}>
          <p class="mt-2 text-fine text-ink-2">{note}</p>
        </Show>
      </article>
    );
  };

  const renderEmails = () => (
    <Show when={!emailsLoading()} fallback={<Empty state="loading" />}>
      <div class="mt-4 box-border rounded-card border border-line bg-surface p-4">
        <p class="m-0 text-fine text-ink-2">
          정토회(@jungto.org) 계정 외에 로그인을 허용할 이메일입니다.
        </p>
        <div class="mt-4 grid gap-4 min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] min-[720px]:items-end">
          <Input
            label="이메일"
            type="email"
            placeholder="oper@example.com"
            value={emailValue()}
            onInput={setEmailValue}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addEmail();
              }
            }}
          />
          <Input
            label="메모 (선택)"
            placeholder="누구 계정인지"
            value={noteValue()}
            onInput={setNoteValue}
          />
          <Button
            class="w-full min-[720px]:w-auto"
            variant="primary"
            loading={emailBusy()}
            onClick={() => void addEmail()}
          >
            추가
          </Button>
        </div>
      </div>

      <Show
        when={emails().length > 0}
        fallback={
          <div class="mt-4 grid gap-2">
            <Empty
              state="empty"
              text="아직 등록된 이메일이 없어요"
              subtitle="로그인을 허용할 이메일을 추가해 보세요."
            />
          </div>
        }
      >
        <div class="mt-4 overflow-hidden rounded-card border border-line bg-surface">
          <For each={emails()}>
            {(email) => (
              <div class="flex flex-wrap items-center gap-3 border-b border-line p-4 last:border-b-0">
                <div class="min-w-0 flex-1 [&_p]:m-0">
                  <p class="truncate text-body font-medium text-ink-1">{email.email}</p>
                  <p class="mt-2 break-all text-fine text-ink-2">
                    {[
                      email.note,
                      email.created_by ? `등록: ${email.created_by}` : null,
                      fmtKstDate(email.created_at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  variant="danger"
                  disabled={emailBusy()}
                  onClick={() => void removeEmail(email)}
                >
                  제거
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );

  return (
    <AdminPage
      title="회원 관리"
      subtitle="회원 역할과 로그인 허용 이메일을 관리해요."
      loading={loading()}
      error={error()}
      message={message()}
      messageTone={messageTone()}
      onRetry={() => void reload()}
      side
      sideContent={
        <>
          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">역할 안내</h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              <b class="font-semibold text-ink-1">회원</b>은 물품을 찾아 대여하고 반납해요. <b class="font-semibold text-ink-1">관리자</b>는 물품
              등록·수정과 회원 관리, 반납 처리를 맡아요.
            </p>
          </section>
          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">마지막 관리자 보호</h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              마지막 남은 관리자는 역할을 바꾸거나 탈퇴시킬 수 없어요. 탈퇴 회원이라도
              대여 중인 물품이 있으면 등록 정보를 삭제할 수 없어요.
            </p>
          </section>
        </>
      }
    >
      <div class="relative">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <input
          class="box-border h-10 w-full min-w-0 rounded-card border border-line bg-surface py-2 pr-10 pl-10 text-body leading-[1.2] text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          type="search"
          aria-label="회원 검색"
          placeholder="이름, 이메일, 연락처 검색…"
          value={q()}
          onInput={(event) => setQ(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && q()) {
              event.preventDefault();
              setQ("");
            }
          }}
        />
        <Show when={q()}>
          <button
            type="button"
            class="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-fine leading-[1.2] text-ink-2 hover:bg-surface-muted hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
            aria-label="검색어 지우기"
            title="검색어 지우기"
            onClick={() => setQ("")}
          >
            ✕
          </button>
        </Show>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="mt-4 grid gap-2">
            <Empty
              state="empty"
              text={q() ? "검색 결과가 없어요" : "아직 회원이 없어요"}
              subtitle={
                q() ? "다른 이름이나 연락처로 검색해 보세요." : ""
              }
            />
          </div>
        }
      >
        <div class="mt-4 grid gap-2">
          <For each={filtered()}>{renderCard}</For>
        </div>
      </Show>

      <details class="mt-8 [&[open]_summary_svg]:rotate-180">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-heading leading-normal font-semibold tracking-tight text-ink-1 [&::-webkit-details-marker]:hidden [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-ink-2 [&_svg]:transition-transform [&:focus-visible]:rounded-card [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-4 [&:focus-visible]:outline-primary">
          <span>로그인 허용 이메일</span>
          <ChevronDownIcon />
        </summary>
        {renderEmails()}
      </details>
    </AdminPage>
  );
}
