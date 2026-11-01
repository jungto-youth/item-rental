import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session, type SessionUser } from "../context/session";
import "../components/ui/button";
import "../components/ui/empty";
import "../components/ui/notice";
import "../components/ui/page-header";
import "../components/common/profile-form";
import { reduceMotion } from "../styles/motion";

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
    css`
      :host {
        display: block;
        max-width: var(--layout-form);
        margin: 0 auto;
      }

      .content {
        max-width: 100%;
      }

      /* 연락처 미등록 안내 — 브랜드 오렌지의 연한 면 */
      .banner {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        margin-top: var(--space-2);
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-fine);
        line-height: var(--line-height);
        box-sizing: border-box;
      }
      .banner p {
        margin: 0;
      }
      .banner button {
        align-self: flex-start;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font-family: inherit;
        font-size: inherit;
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }
      .banner button:hover {
        color: var(--primary-deep);
      }
      @media (min-width: 640px) {
        .banner {
          flex-direction: row;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-2);
        }
      }

      section {
        margin-top: var(--space-3);
      }
      h2 {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-heading);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }

      .card {
        margin-top: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-sizing: border-box;
      }
      @media (max-width: 639px) {
        .card {
          padding: var(--space-2);
        }
      }

      .view-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .who {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        flex: none;
        border-radius: var(--radius-pill);
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-size: var(--text-body);
        font-weight: 600;
      }
      .name {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-body);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .org {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }

      dl {
        margin: var(--space-3) 0 0;
        border-top: 1px solid var(--border);
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--border);
      }
      dt {
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      dd {
        margin: 0;
        color: var(--ink-1);
        font-size: var(--text-body);
        font-variant-numeric: tabular-nums;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .saved {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }
      .saved svg {
        width: 16px;
        height: 16px;
        color: var(--primary-strong);
      }
      .saved[hidden] {
        display: none;
      }

      .footnote {
        margin: var(--space-1) 0 0;
        color: var(--ink-2);
        font-size: var(--text-fine);
      }

      profile-form {
        margin-top: var(--space-2);
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
    if (!u || u.phone) return null;
    return html`
      <div class="banner">
        <p>물품을 대여하려면 연락처를 등록해야 해요.</p>
        <button type="button" @click=${this.startEdit}>연락처 등록하기</button>
      </div>
    `;
  }

  render() {
    if (this.loading) return html`<x-empty state="loading"></x-empty>`;
    if (!this.user) return html`<x-empty state="empty" text="로그인이 필요해요"></x-empty>`;

    const u = this.user;
    const initial = (u.name || u.email).trim().charAt(0).toUpperCase();

    return html`
      <x-page-header
        title="내 정보"
        subtitle="계정 정보와 연락처를 관리해요."
      ></x-page-header>

      <div class="content">
        ${this.banner}

        <section>
          <h2>계정 정보</h2>

          ${this.editing
            ? html`
                <profile-form
                  title="계정 정보 수정"
                  hint="이메일은 변경할 수 없어요."
                  avatar
                  cancellable
                  .email=${u.email}
                  accountLabel="이메일"
                  .initialName=${u.name}
                  .initialPhone=${u.phone ?? ""}
                  @saved=${this.onSaved}
                  @cancel=${() => (this.editing = false)}
                ></profile-form>
              `
            : html`
                <div class="card">
                  <div class="view-head">
                    <div class="who">
                      <span class="avatar" aria-hidden="true">${initial}</span>
                      <div>
                        <p class="name">${u.name || u.email}</p>
                        <p class="org">정토회</p>
                      </div>
                    </div>
                    <x-button variant="secondary" type="button" @click=${this.startEdit}>
                      수정
                    </x-button>
                  </div>

                  <dl>
                    <div class="row">
                      <dt>이메일</dt>
                      <dd title=${u.email}>${u.email}</dd>
                    </div>
                    <div class="row">
                      <dt>연락처</dt>
                      <dd>${u.phone || "미등록"}</dd>
                    </div>
                  </dl>

                  <p class="saved" role="status" ?hidden=${!this.saved}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    저장했어요
                  </p>
                </div>
              `}
        </section>

        <p class="footnote">연락처는 물품 대여·반납 안내에만 사용해요.</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-mypage": PageMypage;
  }
}
