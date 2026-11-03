import { LitElement, html, css } from "lit";
import { confirmDialog } from "../../utils/confirm";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../../api/client";
import type { AdminMember, AllowedEmail, Role } from "../../types";
import { reduceMotion } from "../../styles/motion";
import { sideCardCss } from "../../styles/ui";
import { searchFieldCss } from "../../styles/ui";
import "../../components/admin/admin-page";
import "../../components/ui/empty";
import "../../components/ui/button";
import "../../components/ui/input";
import "../../components/ui/badge";

// 회원 관리: 회원 목록·역할·탈퇴 + 허용 이메일 탭. 모두 admin 전용.
// 역할 변경 보호장치는 서버가 강제: 마지막 관리자 해임 불가.
// 허용 이메일(@jungto.org 외 계정 로그인 허용)은 빈도가 낮아 단독 화면 대신 탭으로 둔다.
@customElement("page-admin-members")
export class PageAdminMembers extends LitElement {

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
    sideCardCss,
    css`
      :host {
        display: block;
      }
      /* 허용 이메일은 목록 아래 접이식 섹션 — 탭으로 화면을 나누지 않는다.
         선 없이 위 간격만으로 구분한다 */
      .emails {
        margin-top: var(--space-4);
      }
      .emails summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        cursor: pointer;
        color: var(--ink-1);
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .emails summary svg {
        width: 20px;
        height: 20px;
        flex: none;
        color: var(--ink-2);
        transition: transform 0.15s ease;
      }
      .emails[open] summary svg {
        transform: rotate(180deg);
      }
      .emails summary:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 4px;
        border-radius: var(--radius);
      }
      .search-wrap {
        position: relative;
      }
      .search-wrap svg {
        position: absolute;
        left: 12px;
        top: 50%;
        width: 16px;
        height: 16px;
        color: var(--ink-3);
        pointer-events: none;
        transform: translateY(-50%);
      }
      .search-input {
        height: 40px;
        padding-left: 40px;
      }

      .list {
        display: grid;
        gap: var(--space-1);
        margin-top: var(--space-2);
      }

      /* 회원 카드 — 아바타 + 이름·연락처 + 역할/탈퇴 액션 */
      .member {
        padding: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-sizing: border-box;
      }
      .member-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      .who {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1;
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex: none;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-fine);
        font-weight: 600;
      }
      .member.withdrawn .avatar {
        background: var(--surface-muted);
        color: var(--ink-2);
      }
      /* 이름 줄 — 탈퇴 배지는 이름 옆에 붙여 상태를 한눈에 읽게 한다 */
      .name-row {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        min-width: 0;
      }
      .name {
        margin: 0;
        min-width: 0;
        color: var(--ink-1);
        font-size: var(--text-body);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .contact {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .contact a {
        color: var(--ink-2);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        width: 100%;
      }
      @media (min-width: 640px) {
        .actions {
          width: auto;
          flex: none;
        }
      }

      /* 역할 선택 — 버튼·인풋과 같은 8px 패딩·테두리 규칙 */
      .select-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        flex: 1;
        min-width: 0;
      }
      @media (min-width: 640px) {
        .select-wrap {
          flex: none;
        }
      }
      .role-select {
        width: 100%;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--ink-1);
        font-family: inherit;
        font-size: var(--text-body);
        line-height: var(--line-height-button);
        cursor: pointer;
        appearance: none;
      }
      @media (min-width: 640px) {
        .role-select {
          width: auto;
        }
      }
      .role-select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .role-select:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .select-caret {
        position: absolute;
        right: 12px;
        top: 50%;
        width: 12px;
        height: 12px;
        color: var(--ink-3);
        pointer-events: none;
        transform: translateY(-50%);
      }
      .select-caret svg {
        display: block;
        width: 12px;
        height: 12px;
      }

      .guard {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }

      /* ===== 허용 이메일 ===== */
      .email-card {
        margin-top: var(--space-2);
        padding: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-sizing: border-box;
      }
      .email-hint {
        margin: 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .email-form {
        display: grid;
        gap: var(--space-2);
        margin-top: var(--space-2);
      }
      @media (min-width: 720px) {
        .email-form {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
          align-items: end;
        }
      }
      .email-list {
        margin-top: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        overflow: hidden;
      }
      .email-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        padding: var(--space-2);
        border-bottom: 1px solid var(--border);
      }
      .email-row:last-child {
        border-bottom: 0;
      }
      .email-main {
        min-width: 0;
        flex: 1;
      }
      .email-main p {
        margin: 0;
      }
      .email-address {
        color: var(--ink-1);
        font-size: var(--text-body);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .email-meta {
        margin-top: var(--space-1) !important;
        color: var(--ink-2);
        font-size: var(--text-fine);
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

  // 활성 관리자가 하나뿐이면 그 관리자는 해임·탈퇴할 수 없다 (서버도 거부)
  private get activeAdminCount(): number {
    return this.members.filter((m) => !m.deactivated_at && m.role === "admin").length;
  }

  private isLastAdmin(m: AdminMember): boolean {
    return !m.deactivated_at && m.role === "admin" && this.activeAdminCount <= 1;
  }

  private keyOf(m: AdminMember, kind: "role" | "withdraw" | "delete"): string {
    return `${m.id}:${kind}`;
  }

  // 다른 행의 작업이 끝날 때까지 이 행의 컨트롤을 잠근다.
  // 처리 중인 행 자신은 버튼의 loading 상태가 잠그므로 여기서는 true 가 아니다.
  private otherRowBusy(m: AdminMember, kind: "role" | "withdraw" | "delete"): boolean {
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
      !(await confirmDialog("", {
        title: `'${who}' 님을 탈퇴 처리할까요?`,
        description:
          "탈퇴하면 계정 접근이 차단되고, 대여·관리 이력은 익명으로 보존돼요.",
        confirmLabel: "탈퇴",
        danger: true,
      }))
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
    if (!(await confirmDialog("", {
      title: `'${who}' 님의 등록 정보를 삭제할까요?`,
      description:
        "이름·이메일·연락처가 제거되고, 완료된 대여·관리 이력은 익명으로 보존돼요. 되돌릴 수 없어요.",
      confirmLabel: "등록 정보 삭제",
      danger: true,
    }))) return;
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
        subtitle="회원 역할과 로그인 허용 이메일을 관리해요."
        ?loading=${this.loading}
        .error=${this.error}
        .message=${this.message}
        .messageTone=${this.messageTone}
        @retry=${() => void this.reload()}
        side
      >
        ${this.renderMembers()}

        <details class="emails">
          <summary>
            <span>
              로그인 허용 이메일
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          ${this.renderEmails()}
        </details>

        <section slot="side" class="side-card">
          <h2>역할 안내</h2>
          <p>
            <b>회원</b>은 물품을 찾아 대여하고 반납해요. <b>관리자</b>는 물품
            등록·수정과 회원 관리, 반납 처리를 맡아요.
          </p>
        </section>

        <section slot="side" class="side-card">
          <h2>마지막 관리자 보호</h2>
          <p>
            마지막 남은 관리자는 역할을 바꾸거나 탈퇴시킬 수 없어요. 탈퇴
            회원이라도 대여 중인 물품이 있으면 등록 정보를 삭제할 수 없어요.
          </p>
        </section>
      </admin-page>
    `;
  }

  private renderMembers() {
    const list = this.filtered;
    return html`
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          class="search-input"
          type="search"
          aria-label="회원 검색"
          placeholder="이름, 이메일, 연락처 검색…"
          .value=${this.q}
          @input=${(e: Event) => (this.q = (e.target as HTMLInputElement).value)}
        />
      </div>
      ${list.length === 0
        ? html`<div class="list">
            <x-empty
              state="empty"
              text=${this.q ? "검색 결과가 없어요" : "아직 회원이 없어요"}
              subtitle=${this.q ? "다른 이름이나 연락처로 검색해 보세요." : ""}
            ></x-empty>
          </div>`
        : html`
            <div class="list">${list.map((m) => this.renderCard(m))}</div>
          `}
    `;
  }

  private renderCard(m: AdminMember) {
    const withdrawn = !!m.deactivated_at;
    const lastAdmin = this.isLastAdmin(m);
    const withdrawKey = this.keyOf(m, "withdraw");
    const initial = (m.name || m.email).trim().charAt(0).toUpperCase();
    const note = lastAdmin
      ? "마지막 관리자는 탈퇴할 수 없어요."
      : withdrawn && (m.active_rental_count ?? 0) > 0
        ? `대여 중 ${m.active_rental_count}건 · 등록 정보 삭제 전 반납 또는 취소 처리가 필요해요.`
        : "";

    return html`
      <article class="member ${withdrawn ? "withdrawn" : ""}">
        <div class="member-head">
          <div class="who">
            <span class="avatar" aria-hidden="true">${initial}</span>
            <div style="min-width:0">
              <div class="name-row">
                <p class="name">${m.name || "—"}</p>
                ${withdrawn ? html`<x-badge kind="withdrawn"></x-badge>` : ""}
              </div>
              <p class="contact">${m.email} · ${this.phoneLine(m)}</p>
            </div>
          </div>

          <div class="actions">
            ${!withdrawn
              ? html`
                  <span class="select-wrap">
                    <select
                      class="role-select"
                      aria-label="역할 지정"
                      ?disabled=${lastAdmin || this.otherRowBusy(m, "role")}
                      .value=${m.role}
                      @change=${(e: Event) =>
                        this.setRole(m, (e.target as HTMLSelectElement).value as Role)}
                    >
                      <option value="user">회원</option>
                      <option value="admin">관리자</option>
                    </select>
                    <span class="select-caret" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </span>
                  <x-button
                    variant="danger"
                    title=${lastAdmin ? "마지막 관리자는 탈퇴할 수 없어요" : ""}
                    ?loading=${this.processingKey === withdrawKey}
                    ?disabled=${lastAdmin || this.otherRowBusy(m, "withdraw")}
                    @click=${() => this.withdraw(m)}
                  >
                    탈퇴
                  </x-button>
                `
              : html`
                  <x-button
                    variant="danger"
                    title=${(m.active_rental_count ?? 0) > 0 ? "대여 중인 물품이 있어요" : ""}
                    ?loading=${this.processingKey === this.keyOf(m, "delete")}
                    ?disabled=${this.otherRowBusy(m, "delete") || (m.active_rental_count ?? 0) > 0}
                    @click=${() => this.deleteRegistration(m)}
                  >
                    등록 정보 삭제
                  </x-button>
                `}
          </div>
        </div>
        ${note ? html`<p class="guard">${note}</p>` : ""}
      </article>
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
      <div class="email-card">
        <p class="email-hint">
          정토회(@jungto.org) 계정 외에 로그인을 허용할 이메일입니다.
        </p>
        <div class="email-form">
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
        ? html`<div class="list">
            <x-empty
              state="empty"
              text="아직 등록된 이메일이 없어요"
              subtitle="로그인을 허용할 이메일을 추가해 보세요."
            ></x-empty>
          </div>`
        : html`
            <div class="email-list">
              ${this.emails.map(
                (m) => html`
                  <div class="email-row">
                    <div class="email-main">
                      <p class="email-address">${m.email}</p>
                      <p class="email-meta">
                        ${[
                          m.note,
                          m.created_by ? `등록: ${m.created_by}` : null,
                          new Date(m.created_at).toLocaleDateString("ko-KR"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <x-button
                      variant="danger"
                      ?disabled=${this.emailBusy}
                      @click=${() => this.removeEmail(m)}
                    >
                      제거
                    </x-button>
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
