import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session, type SessionUser } from "../context/session";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/notice";
import "../components/ui/page-header";
import "../components/common/profile-form";
import { reduceMotion } from "../styles/motion";
import { cardCss, sectionTitleCss } from "../styles/ui";

// 내 정보 페이지: 계정 정보 (상단 배너 + 계정 정보 카드)
// 수정 폼은 profile-form 공용 (온보딩과 동일 입력·검증·저장).
@customElement("page-mypage")
export class PageMypage extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private loading = true;
  // 표시 모드 ↔ 수정 모드 전환
  @state() private editing = false;
  @state() private saved = false;

  static styles = [
    reduceMotion,
    sectionTitleCss,
    cardCss,
    css`
      :host {
        display: block;
      }
      .profile-card {
        margin-top: var(--space-3);
        font-size: var(--text-caption, 13px);
      }
      .profile-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3, 12px);
      }
      /* 상단 안내 — 연락처 미등록일 때만 노출 (탈퇴 회원은 이 페이지에 도달할 수 없다) */
      x-notice {
        display: block;
        margin-bottom: var(--space-4, 16px);
      }
      .profile-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2, 8px);
        margin-top: var(--space-1, 4px);
      }
      .saved-msg {
        color: var(--tone-success-text, var(--color-success));
        font-size: var(--text-fine, 12px);
      }
      .account-section {
        margin-top: var(--space-2, 8px);
      }
      .sub {
        color: var(--color-muted);
        font-size: var(--text-fine, 12px);
      }
      profile-form {
        margin-top: var(--space-3, 12px);
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.loading = false;
  }

  private startEdit() {
    if (!this.user) return;
    this.saved = false;
    this.editing = true;
  }

  // profile-form이 저장·세션 갱신까지 끝냈다 — 표시 모드로 복귀만 한다
  private onSaved() {
    this.user = session.user;
    this.editing = false;
    this.saved = true;
  }

  // 상단 안내 — 연락처 미등록일 때만 노출
  private get banner(): TemplateResult | null {
    const u = this.user;
    if (!u) return null;
    if (!u.phone) {
      return html`물품을 대여하려면 연락처를 등록해야 해요
        <a href="/signup/profile">연락처 등록하기</a>`;
    }
    return null;
  }

  render() {
    if (this.loading) return html`<x-empty state="loading"></x-empty>`;
    if (!this.user) return html`<x-empty state="empty" text="로그인이 필요해요"></x-empty>`;

    return html`
      <x-page-header title="내 정보"></x-page-header>

      ${this.banner
        ? html`<x-notice>${this.banner}</x-notice>`
        : ""}

      <!-- 계정 정보 카드 — 표시 모드(기본) / 수정 모드 전환 -->
      <section class="account-section">
        <h2>계정 정보</h2>

        ${this.editing
          ? html`
              <profile-form
                hint=""
                cancellable
                .initialName=${this.user.name}
                .initialPhone=${this.user.phone ?? ""}
                @saved=${this.onSaved}
                @cancel=${() => (this.editing = false)}
              ></profile-form>
            `
          : html`
              <div class="card profile-card">
                <div class="profile-row">
                  <div>
                    <b>${this.user.name || this.user.email}</b>
                    <div class="sub">
                      ${this.user.email} ${this.user.phone ? `· ${this.user.phone}` : ""}
                    </div>
                  </div>
                </div>
                <div class="profile-actions">
                  <span class="saved-msg" role="status" ?hidden=${!this.saved}>저장했어요</span>
                  <x-button variant="secondary" size="sm" type="button" @click=${this.startEdit}>
                    수정
                  </x-button>
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
