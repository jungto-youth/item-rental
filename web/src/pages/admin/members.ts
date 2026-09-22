import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../../api/client";
import "../../components/ui/badge";
import type { AdminMember, Role } from "../../types";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-nav";
import "../../components/ui/empty";
import "../../components/ui/page-header";
import "../../components/ui/button";
import "../../components/ui/select";
import { rowsCss } from "../../components/ui/rows";

// 회원 관리: 목록·탈퇴·역할 지정/해제 모두 admin 전용
// 역할 변경 보호장치는 서버가 강제: 마지막 관리자 해임 불가
@customElement("page-admin-members")
export class PageAdminMembers extends LitElement {
  @state() private members: AdminMember[] = [];
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private busy = false;
  @state() private message = "";

  static styles = [
    reduceMotion,
    rowsCss,
    css`
      /* 이메일이 길 수 있어 줄바꿈 허용 */
      .meta {
        word-break: break-all;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    await this.reload();
  }

  private async reload() {
    try {
      const res = await api<{ members: AdminMember[] }>("/api/admin/members");
      this.members = res.members;
    } catch (e) {
      this.message = e instanceof Error ? e.message : "오류";
    } finally {
      this.loading = false;
    }
  }

  // 탈퇴 처리 — 활성 회원을 탈퇴시킨다. 약관이 '탈퇴는 관리자에게 요청'이라 안내하는데
  // 처리 수단이 없어 신설했다. 소프트 삭제 — 대여 이력은 남고, 복구 경로는 없다.
  // 마지막 관리자 보호는 서버가 409 로 거부한다.
  private async withdraw(m: AdminMember) {
    const who = m.name || m.email || "이 회원";
    if (
      !confirm(
        `'${who}'님을 탈퇴 처리할까요?\n이후 다시 로그인할 수 없습니다.\n대여 중인 물품은 본인이 반납할 수 없어 관리자가 대신 처리해야 합니다.`,
      )
    )
      return;
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/members/${m.id}/withdraw`, { method: "POST" });
      this.message = `${who}님을 탈퇴 처리했어요`;
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "last_admin")
        this.message = "마지막 관리자는 탈퇴 처리할 수 없어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "탈퇴 처리 실패";
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  // 역할 변경 — admin이 회원의 역할을 지정 (서버도 requireAdmin으로 강제)
  private async setRole(m: AdminMember, role: Role) {
    if (role === m.role) return;
    const label: Record<Role, string> = {
      user: "회원",
      admin: "관리자",
    };
    if (
      !confirm(
        `'${m.name || m.email}'님의 역할을 '${label[role]}'(으)로 바꿀까요?`,
      )
    ) {
      await this.reload(); // 취소 — select 원복
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/members/${m.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      this.message = `${m.name || m.email}님의 역할을 '${label[role]}'(으)로 바꿨어요`;
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "last_admin")
        this.message = "마지막 관리자는 해임할 수 없어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "역할 변경 실패";
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <admin-nav active="members"></admin-nav>
      <x-page-header title="회원 관리"></x-page-header>
      <p class="msg">${this.message}</p>
      ${this.loading
        ? html`<x-empty compact state="loading"></x-empty>`
        : this.members.length === 0
          ? html`<x-empty compact state="empty" text="아직 회원이 없어요"></x-empty>`
          : this.renderCards()
      }
    `;
  }

  private renderCards() {
    return html`
      <div class="rows">${this.members.map((m) => this.renderCard(m))}</div>
    `;
  }

  private renderCard(m: AdminMember) {
    return html`
      <div class="row">
        <span class="head">
          <span class="name">${m.name || "—"}</span>
          ${!m.deactivated_at
        ? html`<x-select
                  ?disabled=${this.busy}
                  aria-label="역할 지정"
                  .value=${m.role}
                  .options=${[
            { value: "user", label: "회원" },
            { value: "admin", label: "관리자" },
          ]}
                  @change=${(e: CustomEvent<{ value: string }>) =>
            this.setRole(m, e.detail.value as Role)}
                ></x-select>`
        : html`<x-badge kind=${m.role}></x-badge>`
      }
          ${m.deactivated_at ? html`<x-badge kind="withdrawn"></x-badge>` : ""}
          ${!m.deactivated_at
        ? html`<x-button
                  variant="danger"
                  size="sm"
                  ?disabled=${this.busy}
                  @click=${() => this.withdraw(m)}
                >
                  탈퇴
                </x-button>`
        : ""
      }
          </span>
        <span class="meta">${m.email} · ${m.phone ?? "연락처 미등록"}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-members": PageAdminMembers;
  }
}
