import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../../api/client";
import "../../components/ui/badge";
import type { AdminMember, Role } from "../../types";
import { reduceMotion } from "../../styles/motion";

// SPEC §4.4 — 회원 관리: 승인/거절·역할 지정/해제 모두 admin 전용
// 역할 변경 보호장치는 서버가 강제: 마지막 관리자 해임 불가, 미승인 회원 임명 불가
@customElement("page-admin-members")
export class PageAdminMembers extends LitElement {
  @state() private members: AdminMember[] = [];
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private busy = false;
  @state() private message = "";

  static styles = [
    reduceMotion,
    css`
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      /* 표 대신 두 줄 로우 — 대여 관리와 같은 이유: 표는 좌우 스크롤로 처리 버튼을 가림 (§4.4) */
      .rows {
        display: grid;
      }
      .row {
        border-bottom: 1px solid var(--color-border);
        padding: var(--space-2) 0;
        display: grid;
        gap: var(--space-1);
        font-size: var(--text-caption);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 44px;
      }
      .name {
        font-weight: 600;
        font-size: var(--text-body);
        letter-spacing: var(--tracking-tight);
        flex: 1;
        min-width: 0;
      }
      .head x-badge {
        flex-shrink: 0;
      }
      .who {
        color: var(--color-muted);
        word-break: break-all;
      }
      .link {
        background: none;
        border: 0;
        color: var(--color-primary);
        cursor: pointer;
        padding: var(--space-2);
        font-size: var(--text-caption);
        font-family: inherit;
      }
      .link.danger {
        color: var(--tone-danger-text);
      }
      .head .link {
        flex-shrink: 0;
      } /* 액션 링크가 눌리지 않게 — 44px 터치 타깃 유지 */
      select {
        height: 36px;
        padding: 0 var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: var(--text-caption);
        font-family: inherit;
      }
      .msg {
        color: var(--color-primary);
        font-size: var(--text-caption);
        min-height: 1.2em;
      }
      .empty {
        color: var(--color-muted);
        font-size: var(--text-caption);
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

  private async approve(m: AdminMember) {
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/members/${m.id}/approve`, { method: "POST" });
      this.message = `${m.name || m.email}님을 승인했어요`;
      await this.reload();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "승인 실패";
    } finally {
      this.busy = false;
    }
  }

  private async reject(m: AdminMember) {
    if (!confirm(`'${m.name || m.email}'님의 가입을 거절할까요?`)) return;
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/members/${m.id}/reject`, { method: "POST" });
      this.message = "거절했어요";
      await this.reload();
    } catch (e) {
      this.message = e instanceof Error ? e.message : "거절 실패";
    } finally {
      this.busy = false;
    }
  }

  // 탈퇴(비활성화) — 활성 회원을 비활성화한다. 약관이 '탈퇴는 관리자에게 요청'이라 안내하는데
  // 처리 수단이 없어 신설했다(§4.1, v3.1). 마지막 관리자 보호는 서버가 409 로 거부한다.
  private async deactivate(m: AdminMember) {
    const who = m.name || m.email || "이 회원";
    if (
      !confirm(
        `'${who}'님을 비활성화(탈퇴 처리)할까요?\n이후 다시 로그인할 수 없습니다.`,
      )
    )
      return;
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/members/${m.id}/deactivate`, { method: "POST" });
      this.message = `${who}님을 비활성화했어요`;
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "last_admin")
        this.message = "마지막 관리자는 비활성화할 수 없어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "비활성화 실패";
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
      else if (code === "member_not_approved")
        this.message =
          "승인 대기 회원이에요 — 먼저 승인한 후 역할을 바꿀 수 있어요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "역할 변경 실패";
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <h1>회원 관리</h1>
      <p class="msg">${this.message}</p>
      ${
        this.loading
          ? html`<p class="empty">불러오는 중…</p>`
          : this.members.length === 0
            ? html`<p class="empty">아직 회원이 없어요</p>`
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
    const acts =
      m.status === "pending"
        ? html`
            <button
              class="link"
              ?disabled=${this.busy}
              @click=${() => this.approve(m)}
            >
              승인
            </button>
            <button
              class="link danger"
              ?disabled=${this.busy}
              @click=${() => this.reject(m)}
            >
              거절
            </button>
          `
        : "";
    return html`
      <div class="row">
        <span class="head">
          <span class="name">${m.name || "—"}</span>
          ${
            m.status === "approved"
              ? html`<select
                  ?disabled=${this.busy}
                  aria-label="역할 지정"
                  .value=${m.role}
                  @change=${(e: Event) => this.setRole(m, (e.target as HTMLSelectElement).value as Role)}
                >
                  <option value="user" ?selected=${m.role === "user"}>
                    회원
                  </option>
                  <option value="admin" ?selected=${m.role === "admin"}>
                    관리자
                  </option>
                </select>`
              : html`<x-badge kind=${m.role}></x-badge>`
          }
          <x-badge kind=${m.status}></x-badge>
          ${
            m.status === "approved"
              ? html`<button
                  class="link danger"
                  ?disabled=${this.busy}
                  @click=${() => this.deactivate(m)}
                >
                  비활성화
                </button>`
              : ""
          }
          ${acts}
        </span>
        <span class="who">${m.email} · ${m.phone ?? "연락처 미등록"}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-members": PageAdminMembers;
  }
}
