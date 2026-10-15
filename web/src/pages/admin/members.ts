import { LitElement, html, css } from "lit";
import { confirmDialog } from "../../utils/confirm";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../../api/client";
import type { AdminMember, AllowedEmail, Role } from "../../types";
import { reduceMotion } from "../../styles/motion";
import { formCss, searchFieldCss } from "../../styles/ui";
import { rowsCss } from "../../components/ui/rows";
import "../../components/admin/admin-page";
import "../../components/ui/empty";
import "../../components/ui/button";
import "../../components/ui/input";
import "../../components/ui/badge";
import "../../components/ui/chip";
import "../../components/common/reservation-row";

// 회원 관리: 회원 목록·역할·탈퇴 + 허용 이메일 탭. 모두 admin 전용.
// 역할 변경 보호장치는 서버가 강제: 마지막 관리자 해임 불가.
// 허용 이메일(@jungto.org 외 계정 로그인 허용)은 빈도가 낮아 단독 화면 대신 탭으로 둔다.
@customElement("page-admin-members")
export class PageAdminMembers extends LitElement {
  @state() private tab: "members" | "emails" = "members";

  // ===== 회원 목록 =====
  @state() private members: AdminMember[] = [];
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private q = "";
  // 처리 중인 행 — "회원id:동작" 키. 해당 행의 컨트롤만 잠그고 나머지는 살린다
  @state() private processingKey: string | null = null;

  // ===== 허용 이메일 =====
  @state() private emails: AllowedEmail[] = [];
  @state() private emailsLoading = true;
  @state() private emailValue = "";
  @state() private noteValue = "";
  @state() private emailBusy = false;

  @state() private message = "";
  // 성공/실패 구분 — 실패 문구가 성공과 같은 파란색으로 나오면 안 된다
  @state() private messageTone: "info" | "success" | "error" = "info";
  @state() private error = "";

  static styles = [
    reduceMotion,
    searchFieldCss,
    formCss,
    rowsCss,
    css`
      x-chip.tab {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }
      .search-input {
        margin-bottom: var(--space-3, 12px);
      }
      .count {
        margin: 0 0 var(--space-2, 8px);
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      /* 이메일이 길 수 있어 줄바꿈 허용 */
      .meta {
        word-break: break-all;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    await Promise.all([this.reload(), this.reloadEmails()]);
  }

  private async reload() {
    this.error = "";
    try {
      const res = await api<{ members: AdminMember[] }>("/api/admin/members");
      this.members = res.members;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "회원 목록을 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  private async reloadEmails() {
    try {
      const res = await api<{ allowedEmails: AllowedEmail[] }>(
        "/api/admin/allowed-emails",
      );
      this.emails = res.allowedEmails;
    } catch {
      // 회원 목록은 보여주고 이메일 탭에서 안내한다
      this.emails = [];
    } finally {
      this.emailsLoading = false;
    }
  }

  private get filtered(): AdminMember[] {
    const q = this.q.trim().toLowerCase();
    if (!q) return this.members;
    return this.members.filter((m) =>
      `${m.name ?? ""} ${m.email} ${m.phone ?? ""}`.toLowerCase().includes(q),
    );
  }

  private keyOf(m: AdminMember, kind: "role" | "withdraw" | "delete"): string {
    return `${m.id}:${kind}`;
  }

  private rowBusy(m: AdminMember, kind: "role" | "withdraw" | "delete"): boolean {
    if (!this.processingKey) return false;
    return this.processingKey !== this.keyOf(m, kind);
  }

  // 탈퇴 처리 — 활성 회원을 탈퇴시킨다. 소프트 삭제 — 대여 이력은 남고, 복구 경로는 없다.
  // 마지막 관리자 보호는 서버가 409 로 거부한다.
  private async withdraw(m: AdminMember) {
    // busy 확인은 다이얼로그보다 먼저 — 뒤에 두면 연타로 다이얼로그가 두 개 열린다
    if (this.processingKey) return;
    const who = m.name || m.email || "이 회원";
    if (
      !(await confirmDialog(
        `'${who}'님을 탈퇴 처리할까요?\n이후 다시 로그인할 수 없어요.\n대여 중인 물품은 본인이 반납할 수 없어 관리자가 대신 처리해야 해요.`,
        { confirmLabel: "탈퇴 처리" },
      ))
    )
      return;
    if (this.processingKey) return;
    this.processingKey = this.keyOf(m, "withdraw");
    try {
      await api(`/api/admin/members/${m.id}/withdraw`, { method: "POST" });
      this.message = `${who}님을 탈퇴 처리했어요`;
      this.messageTone = "success";
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "last_admin")
        this.message = "마지막 관리자는 탈퇴 처리할 수 없어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "탈퇴 처리 실패";
      this.messageTone = "error";
      await this.reload();
    } finally {
      this.processingKey = null;
    }
  }

  // 등록 정보 제거 — 먼저 탈퇴 처리하고, 대여 중인 물품이 없는 경우에만 허용한다.
  private async deleteRegistration(m: AdminMember) {
    if (this.processingKey) return;
    const who = m.name || m.email;
    if (!(await confirmDialog(
      `'${who}'님의 등록 정보를 삭제할까요?\n대여 중인 물품이 없어야 해요. 이름·이메일·연락처는 제거하고 완료된 이력은 익명으로 보존해요.\n삭제 후에는 다시 로그인하여 새 일반 회원으로 등록할 수 있어요.`,
      { confirmLabel: "등록 정보 삭제" },
    ))) return;
    if (this.processingKey) return;
    this.processingKey = this.keyOf(m, "delete");
    try {
      await api(`/api/admin/members/${m.id}`, { method: "DELETE" });
      this.message = `${who}님의 등록 정보를 삭제했어요`;
      this.messageTone = "success";
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      this.message = code === "has_active_rentals"
        ? "대여 중인 물품이 있어 삭제할 수 없어요. 먼저 반납 또는 취소 처리해주세요"
        : code === "active_member"
          ? "활성 회원은 바로 삭제할 수 없어요. 먼저 탈퇴 처리해주세요"
          : e instanceof Error ? e.message : "등록 정보 삭제에 실패했어요";
      this.messageTone = "error";
    } finally {
      await this.reload();
      this.processingKey = null;
    }
  }

  // 역할 변경 — admin이 회원의 역할을 지정 (서버도 requireAdmin으로 강제)
  private async setRole(m: AdminMember, role: Role) {
    if (role === m.role || this.processingKey) return;
    const label: Record<Role, string> = {
      user: "회원",
      admin: "관리자",
    };
    if (
      !(await confirmDialog(
        `'${m.name || m.email}'님의 역할을 '${label[role]}'(으)로 바꿀까요?`,
        { confirmLabel: "변경", danger: false },
      ))
    ) {
      return; // 취소 — 칩은 제어 컴포넌트라 역할 상태가 안 바뀌면 제자리에 머문다
    }
    if (this.processingKey) return;
    this.processingKey = this.keyOf(m, "role");
    try {
      await api(`/api/admin/members/${m.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      this.message = `${m.name || m.email}님의 역할을 '${label[role]}'(으)로 바꿨어요`;
      this.messageTone = "success";
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "last_admin")
        this.message = "마지막 관리자는 해임할 수 없어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "역할 변경 실패";
      this.messageTone = "error";
      await this.reload();
    } finally {
      this.processingKey = null;
    }
  }

  // ===== 허용 이메일 =====

  private async addEmail() {
    const email = this.emailValue.trim();
    if (!email || !email.includes("@")) {
      this.message = "이메일 형식을 확인해주세요";
      this.messageTone = "error";
      return;
    }
    if (this.emailBusy) return;
    this.emailBusy = true;
    try {
      await api("/api/admin/allowed-emails", {
        method: "POST",
        body: JSON.stringify({ email, note: this.noteValue.trim() || undefined }),
      });
      this.message = `${email} 계정의 로그인을 허용했어요`;
      this.messageTone = "success";
      this.emailValue = "";
      this.noteValue = "";
      await this.reloadEmails();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "duplicate") this.message = "이미 등록된 이메일이에요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "추가 실패";
      this.messageTone = "error";
    } finally {
      this.emailBusy = false;
    }
  }

  // remove 는 LitElement(HTMLElement)가 이미 가진 메서드라 덮어쓸 수 없다
  private async removeEmail(m: AllowedEmail) {
    if (
      !(await confirmDialog(
        `'${m.email}' 계정의 로그인을 허용 목록에서 제거할까요?\n제거 후 이 계정으로는 다시 로그인할 수 없어요.`,
        { confirmLabel: "제거" },
      ))
    )
      return;
    if (this.emailBusy) return;
    this.emailBusy = true;
    try {
      await api(`/api/admin/allowed-emails/${m.id}`, { method: "DELETE" });
      this.message = `${m.email} 계정을 제거했어요`;
      this.messageTone = "success";
      await this.reloadEmails();
    } catch (e) {
      this.message = e instanceof ApiError ? e.message : "제거 실패";
      this.messageTone = "error";
      await this.reloadEmails();
    } finally {
      this.emailBusy = false;
    }
  }

  render() {
    return html`
      <admin-page
        title="회원 관리"
        ?loading=${this.loading}
        .error=${this.error}
        .message=${this.message}
        .messageTone=${this.messageTone}
        @retry=${() => void this.reload()}
      >
        <x-chip
          class="tab"
          ariaLabel="회원 관리 탭"
          .value=${this.tab}
          .options=${[
            { value: "members", label: "회원 목록", count: this.members.length },
            { value: "emails", label: "허용 이메일", count: this.emails.length },
          ]}
          @change=${(e: CustomEvent<{ value: string }>) =>
            (this.tab = e.detail.value as "members" | "emails")}
        ></x-chip>
        ${this.tab === "members" ? this.renderMembers() : this.renderEmails()}
      </admin-page>
    `;
  }

  private renderMembers() {
    const list = this.filtered;
    return html`
      <input
        class="search-input"
        type="search"
        aria-label="회원 검색"
        placeholder="이름, 이메일, 연락처 검색…"
        .value=${this.q}
        @input=${(e: Event) => (this.q = (e.target as HTMLInputElement).value)}
      />
      ${list.length === 0
        ? html`<x-empty
            compact
            state="empty"
            text=${this.q ? `'${this.q}'로 찾은 회원이 없어요` : "아직 회원이 없어요"}
          ></x-empty>`
        : html`
            <p class="count" role="status">${list.length}명</p>
            <div>${list.map((m) => this.renderCard(m))}</div>
          `}
    `;
  }

  private renderCard(m: AdminMember) {
    const withdrawKey = this.keyOf(m, "withdraw");
    return html`
      <reservation-row
        title=${m.name || "—"}
        badgeKind=${m.deactivated_at ? "withdrawn" : ""}
      >
        ${!m.deactivated_at
          ? html`<x-chip
              slot="actions"
              ?disabled=${this.rowBusy(m, "role")}
              ariaLabel="역할 지정"
              .value=${m.role}
              .options=${[
                { value: "user", label: "회원" },
                { value: "admin", label: "관리자" },
              ]}
              @change=${(e: CustomEvent<{ value: string }>) =>
                this.setRole(m, e.detail.value as Role)}
            ></x-chip>
            <x-button
              slot="actions"
              variant="danger"
              size="sm"
              ?loading=${this.processingKey === withdrawKey}
              ?disabled=${this.rowBusy(m, "withdraw")}
              @click=${() => this.withdraw(m)}
            >
              탈퇴
            </x-button>`
          : html`<x-badge slot="actions" kind=${m.role}></x-badge>
              <x-button slot="actions" variant="danger" size="sm"
                ?loading=${this.processingKey === this.keyOf(m, "delete")}
                ?disabled=${this.rowBusy(m, "delete") || (m.active_rental_count ?? 0) > 0}
                @click=${() => this.deleteRegistration(m)}>등록 정보 삭제</x-button>`}
        <span style="overflow-wrap:anywhere">${m.email} · ${this.phoneLine(m)}</span>
        ${(m.active_rental_count ?? 0) > 0
          ? html`<span>대여 중 ${m.active_rental_count}건 · 등록 정보 삭제 전 반납 또는 취소 처리가 필요해요</span>` : ""}
      </reservation-row>
    `;
  }

  private phoneLine(m: AdminMember) {
    return m.phone
      ? html`<a href="tel:${m.phone.replace(/[^+\d]/g, "")}">${m.phone}</a>`
      : "연락처 미등록";
  }

  private renderEmails() {
    if (this.emailsLoading) return html`<x-empty state="loading"></x-empty>`;
    return html`
      <div class="form">
        <x-input
          label="이메일"
          type="email"
          placeholder="oper@example.com"
          .value=${this.emailValue}
          @input=${(e: Event) =>
            (this.emailValue = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void this.addEmail();
            }
          }}
        ></x-input>
        <div class="form-row">
          <x-input
            label="메모 (선택)"
            placeholder="누구 계정인지"
            .value=${this.noteValue}
            @input=${(e: Event) =>
              (this.noteValue = (e.target as HTMLInputElement).value)}
          ></x-input>
          <!-- x-button 은 form-associated 가 아니어서 form submit 에 참여하지 못한다 — 클릭으로 처리 -->
          <x-button
            variant="primary"
            ?loading=${this.emailBusy}
            @click=${() => void this.addEmail()}
          >
            추가
          </x-button>
        </div>
      </div>
      ${this.emails.length === 0
        ? html`<x-empty compact state="empty" text="아직 등록된 이메일이 없어요"></x-empty>`
        : html`
            <div class="rows">
              ${this.emails.map(
                (m) => html`
                  <div class="row">
                    <span class="head">
                      <span class="name">${m.email}</span>
                      <x-button
                        variant="danger"
                        size="sm"
                        ?disabled=${this.emailBusy}
                        @click=${() => this.removeEmail(m)}
                      >
                        제거
                      </x-button>
                    </span>
                    <span class="meta">
                      ${[
                        m.note,
                        m.created_by ? `등록: ${m.created_by}` : null,
                        new Date(m.created_at).toLocaleDateString("ko-KR"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-members": PageAdminMembers;
  }
}
