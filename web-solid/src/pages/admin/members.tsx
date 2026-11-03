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
          ? "대여 중인 물품이 있어 삭제할 수 없어요. 먼저 반납 또는 취소 처리해주세요"
          : code === "active_member"
            ? "활성 회원은 바로 삭제할 수 없어요. 먼저 탈퇴 처리해주세요"
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
      setMessage("이메일 형식을 확인해주세요");
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
      <article class={`member ${withdrawn ? "withdrawn" : ""}`}>
        <div class="member-head">
          <div class="who">
            <span class="avatar" aria-hidden="true">
              {initial}
            </span>
            <div class="who-text">
              <div class="name-row">
                <p class="name">{member.name || "—"}</p>
                <Show when={withdrawn}>
                  <Badge kind="withdrawn" />
                </Show>
              </div>
              <p class="contact">
                {member.email} · {phoneLine(member)}
              </p>
            </div>
          </div>

          <div class="actions">
            <Show
              when={!withdrawn}
              fallback={
                <Button
                  variant="danger"
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
              <span class="select-wrap">
                <select
                  class="role-select"
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
                <span class="select-caret" aria-hidden="true">
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
          <p class="guard">{note}</p>
        </Show>
      </article>
    );
  };

  const renderEmails = () => (
    <Show when={!emailsLoading()} fallback={<Empty state="loading" />}>
      <div class="email-card">
        <p class="email-hint">
          정토회(@jungto.org) 계정 외에 로그인을 허용할 이메일입니다.
        </p>
        <div class="email-form">
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
          <div class="list">
            <Empty
              state="empty"
              text="아직 등록된 이메일이 없어요"
              subtitle="로그인을 허용할 이메일을 추가해 보세요."
            />
          </div>
        }
      >
        <div class="email-list">
          <For each={emails()}>
            {(email) => (
              <div class="email-row">
                <div class="email-main">
                  <p class="email-address">{email.email}</p>
                  <p class="email-meta">
                    {[
                      email.note,
                      email.created_by ? `등록: ${email.created_by}` : null,
                      new Date(email.created_at).toLocaleDateString("ko-KR"),
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
          <section class="side-card">
            <h2>역할 안내</h2>
            <p>
              <b>회원</b>은 물품을 찾아 대여하고 반납해요. <b>관리자</b>는 물품
              등록·수정과 회원 관리, 반납 처리를 맡아요.
            </p>
          </section>
          <section class="side-card">
            <h2>마지막 관리자 보호</h2>
            <p>
              마지막 남은 관리자는 역할을 바꾸거나 탈퇴시킬 수 없어요. 탈퇴 회원이라도
              대여 중인 물품이 있으면 등록 정보를 삭제할 수 없어요.
            </p>
          </section>
        </>
      }
    >
      <div class="search-wrap">
        <SearchIcon />
        <input
          class="search-input"
          type="search"
          aria-label="회원 검색"
          placeholder="이름, 이메일, 연락처 검색…"
          value={q()}
          onInput={(event) => setQ(event.currentTarget.value)}
        />
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="list">
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
        <div class="list">
          <For each={filtered()}>{renderCard}</For>
        </div>
      </Show>

      <details class="emails">
        <summary>
          <span>로그인 허용 이메일</span>
          <ChevronDownIcon />
        </summary>
        {renderEmails()}
      </details>
    </AdminPage>
  );
}
