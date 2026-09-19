import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import "../components/ui/badge";
import "../components/ui/button";
import { reduceMotion } from "../styles/motion";

// SPEC §4.1 — 내 정보 페이지: 계정 정보 (상단 배너 + 계정 정보 카드)
@customElement("page-mypage")
export class PageMypage extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private loading = true;
  // 인라인 수정 — 카드 안에서 바로 수정 (온보딩용 /signup/profile 과 별개 흐름)
  @state() private editing = false;
  @state() private formName = "";
  @state() private formPhone = "";
  @state() private formMessage = "";
  @state() private busy = false;
  @state() private saved = false;

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block;
      }
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.2;
        margin: 0 0 var(--space-4);
      }
      h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: var(--space-5) 0 var(--space-3);
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4);
        display: grid;
        gap: var(--space-2);
        font-size: var(--text-body);
        line-height: 1.47;
      }
      .profile-card {
        margin-top: var(--space-3);
        font-size: var(--text-caption, 13px);
      }
      .profile-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      /* 상단 안내 — 최대 1개만 노출 (우선순위: 비활성화 > 연락처 등록) */
      .banner {
        margin-bottom: var(--space-4);
      }
      .banner.warning {
        border-color: var(--color-warning);
        background: var(--tone-warning-bg);
        color: var(--tone-warning-text);
      }
      .banner.danger {
        border-color: var(--color-danger);
        background: var(--tone-danger-bg);
        color: var(--tone-danger-text);
      }
      .banner a {
        color: var(--color-primary);
      }
      .link-btn {
        background: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm, 6px);
        color: var(--color-primary);
        cursor: pointer;
        padding: 5px 12px;
        font-size: var(--text-caption, 13px);
        font-weight: 500;
        font-family: inherit;
        transition: all 0.12s ease;
      }
      .link-btn:hover:not(:disabled) {
        background: var(--color-primary);
        color: var(--color-primary-text);
        border-color: var(--color-primary);
      }
      .link-btn:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 1px;
      }
      /* 인라인 수정 폼 — 카드 안 상태 전환 (표시 모드 ↔ 입력 모드) */
      .field {
        display: grid;
        gap: 4px;
      }
      .field span {
        font-size: var(--text-caption, 13px);
        color: var(--color-muted);
      }
      .field input {
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm, 6px);
        background: var(--color-bg); /* 화이트 카드 위 파치먼트 fill */
        color: var(--color-text);
        font-size: 1rem; /* iOS 줌 방지 */
        font-family: inherit;
        box-sizing: border-box;
        width: 100%;
      }
      .field input:focus {
        border-color: var(--color-primary);
      }
      .edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-top: 6px;
      }
      .form-msg {
        color: var(--color-danger);
        font-size: var(--text-fine, 12px);
        margin: 0;
        min-height: 1em;
      }
      .profile-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
      }
      .saved-msg {
        color: var(--color-success);
        font-size: var(--text-fine, 12px);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.loading = false;
  }

  // 인라인 수정 시작 — 현재 값으로 폼 초기화 (표시 모드 → 입력 모드)
  private startEdit() {
    if (!this.user) return;
    this.formName = this.user.name;
    this.formPhone = this.user.phone ?? "";
    this.formMessage = "";
    this.saved = false;
    this.editing = true;
  }

  private cancelEdit() {
    this.editing = false;
    this.formMessage = "";
  }

  // 저장 후 세션 갱신 → 표시 모드 복귀. /signup/profile 과 동일한 API 사용
  private async save(e: Event) {
    e.preventDefault();
    if (this.busy) return;
    this.busy = true;
    this.formMessage = "";
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ name: this.formName, phone: this.formPhone }),
      });
      await session.refresh();
      this.user = session.user;
      this.editing = false;
      this.saved = true;
    } catch (err) {
      this.formMessage = err instanceof Error ? err.message : "저장에 실패했습니다.";
    } finally {
      this.busy = false;
    }
  }

  // 상단 안내는 최대 1개만 — 우선순위: 비활성화 > 연락처 등록
  private get bannerCard(): { tone: string; text: TemplateResult } | null {
    const u = this.user;
    if (!u) return null;
    if (u.status === "inactive") {
      return {
        tone: "danger",
        text: html`비활성화된 계정이에요 — 재대여를 원하시면 관리자에게 문의해주세요.`,
      };
    }
    if (!u.phone) {
      return {
        tone: "info",
        text: html`물품을 대여하려면 연락처를 등록해야 해요 —
          <a href="/signup/profile">연락처 등록하기</a>`,
      };
    }
    return null;
  }

  render() {
    if (this.loading) return html`<p>불러오는 중…</p>`;
    if (!this.user) return html`<p>로그인이 필요해요</p>`;

    return html`
      <h1>내 정보</h1>

      ${this.bannerCard
        ? html`<div class="card banner ${this.bannerCard.tone}">${this.bannerCard.text}</div>`
        : ""}

      <!-- 계정 정보 카드 — 표시 모드(기본) / 인라인 수정 모드 전환 -->
      <section style="margin-top: var(--space-6)">
        <h2>계정 정보</h2>

        ${this.editing
          ? html`
              <form class="card profile-card" @submit=${this.save}>
                <label class="field">
                  <span>이름</span>
                  <input
                    required
                    .value=${this.formName}
                    @input=${(e: Event) => (this.formName = (e.target as HTMLInputElement).value)}
                  />
                </label>
                <label class="field">
                  <span>휴대폰 번호</span>
                  <input
                    required
                    type="tel"
                    placeholder="010-1234-5678"
                    .value=${this.formPhone}
                    @input=${(e: Event) => (this.formPhone = (e.target as HTMLInputElement).value)}
                  />
                </label>
                <p class="form-msg">${this.formMessage}</p>
                <div class="edit-actions">
                  <x-button
                    variant="secondary"
                    size="md"
                    type="button"
                    ?disabled=${this.busy}
                    @click=${this.cancelEdit}
                  >
                    취소
                  </x-button>
                  <x-button variant="primary" size="md" type="submit" ?loading=${this.busy}>
                    저장
                  </x-button>
                </div>
              </form>
            `
          : html`
              <div class="card profile-card">
                <div class="profile-row">
                  <div>
                    <b>${this.user.name || this.user.email}</b>
                    <div style="color: var(--color-muted); font-size: var(--text-fine, 12px);">
                      ${this.user.email} ${this.user.phone ? `· ${this.user.phone}` : ""}
                    </div>
                  </div>
                  <div>
                    ${this.user.status === "inactive"
                      ? html`<x-badge kind=${this.user.status}></x-badge>`
                      : ""}
                  </div>
                </div>
                <div class="profile-actions">
                  <span class="saved-msg" role="status" ?hidden=${!this.saved}>저장했어요</span>
                  <button type="button" class="link-btn" @click=${this.startEdit}>
                    수정
                  </button>
                </div>
              </div>
            `}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-mypage": PageMypage;
  }
}