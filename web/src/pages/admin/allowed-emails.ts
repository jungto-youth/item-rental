import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../../api/client";
import type { AllowedEmail } from "../../types";
import { reduceMotion } from "../../styles/motion";
import "../../components/admin/admin-page";
import "../../components/ui/empty";
import "../../components/ui/button";
import "../../components/ui/input";
import { rowsCss } from "../../components/ui/rows";
import { confirmDialog } from "../../utils/confirm";

// 로그인 허용 예외 이메일 관리: 목록·추가·제거 모두 admin 전용
// @jungto.org 계정은 이 목록과 무관하게 항상 로그인 가능 — 여기엔 그 외 계정만 등록한다.
@customElement("page-admin-allowed-emails")
export class PageAdminAllowedEmails extends LitElement {
  @state() private emails: AllowedEmail[] = [];
  @state() private loading = true; /* 초기 로드 전 — "없어요" 깜빡임 방지 */
  @state() private busy = false;
  @state() private message = "";
  @state() private error = "";
  @state() private emailValue = "";
  @state() private noteValue = "";

  static styles = [
    reduceMotion,
    rowsCss,
    css`
      .form {
        display: grid;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
        padding: var(--space-3-5);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface);
      }
      .form-row {
        display: flex;
        gap: var(--space-2);
        align-items: flex-end;
      }
      .form-row x-input {
        flex: 1;
      }
      .form-row x-button {
        flex-shrink: 0;
      }
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
    this.error = "";
    try {
      const res = await api<{ allowedEmails: AllowedEmail[] }>(
        "/api/admin/allowed-emails",
      );
      this.emails = res.allowedEmails;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "허용 이메일 목록을 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  private async add() {
    const email = this.emailValue.trim();
    if (!email || !email.includes("@")) {
      this.message = "이메일 형식을 확인해주세요";
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      await api("/api/admin/allowed-emails", {
        method: "POST",
        body: JSON.stringify({ email, note: this.noteValue.trim() || undefined }),
      });
      this.message = `${email} 계정의 로그인을 허용했어요`;
      this.emailValue = "";
      this.noteValue = "";
      await this.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "duplicate") this.message = "이미 등록된 이메일이에요";
      else if (e instanceof ApiError) this.message = e.message;
      else this.message = "추가 실패";
    } finally {
      this.busy = false;
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
    if (this.busy) return;
    this.busy = true;
    try {
      await api(`/api/admin/allowed-emails/${m.id}`, { method: "DELETE" });
      this.message = `${m.email} 계정을 제거했어요`;
      await this.reload();
    } catch (e) {
      this.message = e instanceof ApiError ? e.message : "제거 실패";
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <admin-page
        active="allowed-emails"
        title="허용 이메일"
        subtitle="정토회 계정(@jungto.org) 외에 로그인을 허용할 이메일을 관리해요"
        ?loading=${this.loading}
        .error=${this.error}
        .message=${this.message}
        @retry=${() => void this.reload()}
      >
        <div class="form">
          <x-input
            id="new-email"
            label="이메일"
            type="email"
            placeholder="oper@example.com"
            .value=${this.emailValue}
            @input=${(e: Event) =>
          (this.emailValue = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              this.add();
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
            <x-button variant="primary" ?loading=${this.busy} @click=${this.add}>
              추가
            </x-button>
          </div>
        </div>
        ${this.emails.length === 0
          ? html`<x-empty
              compact
              state="empty"
              text="아직 등록된 이메일이 없어요"
            ></x-empty>`
          : this.renderRows()}
      </admin-page>
    `;
  }

  private renderRows() {
    return html`
      <div class="rows">
        ${this.emails.map(
          (m) => html`
            <div class="row">
              <span class="head">
                <span class="name">${m.email}</span>
                <x-button
                  variant="danger"
                  size="sm"
                  ?disabled=${this.busy}
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-allowed-emails": PageAdminAllowedEmails;
  }
}
