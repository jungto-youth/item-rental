import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

type Section = { id: string; title: string };

const PRIVACY_SECTIONS: Section[] = [
  { id: "privacy-1", title: "1. 수집하는 개인정보 항목" },
  { id: "privacy-2", title: "2. 수집 목적" },
  { id: "privacy-3", title: "3. 보관 기간 및 파기" },
  { id: "privacy-4", title: "4. 개인정보 제3자 제공" },
  { id: "privacy-5", title: "5. 개인정보 처리 위탁" },
  { id: "privacy-6", title: "6. 회원 권리" },
  { id: "privacy-7", title: "7. 문의처" },
];

const TERMS_SECTIONS: Section[] = [
  { id: "terms-1", title: "1. 목적" },
  { id: "terms-2", title: "2. 회원 가입" },
  { id: "terms-3", title: "3. 물품 대여" },
  { id: "terms-4", title: "4. 회원 의무" },
  { id: "terms-5", title: "5. 운영진 의무" },
  { id: "terms-6", title: "6. 책임 제한" },
  { id: "terms-7", title: "7. 약관 변경" },
];

// 개인정보 처리방침 · 서비스 이용약관 (구글 OAuth 게시 요건)
// /policy/privacy · /policy/terms 두 경로가 이 컴포넌트 하나로 처리됨
@customElement("page-policy")
export class PagePolicy extends LitElement {
  @property() private kind: "privacy" | "terms" = "privacy";

  static styles = css`
    :host {
      display: block;
      max-width: var(--layout-doc);
      margin: 0 auto;
    }

    /* 정책 종류 탭 — 밑줄로 현재 문서를 표시한다 */
    .tabs {
      display: flex;
      gap: var(--space-3);
      border-bottom: 1px solid var(--border);
    }
    .tabs a {
      margin-bottom: -1px;
      padding-bottom: var(--space-1);
      border-bottom: 2px solid transparent;
      color: var(--ink-2);
      font-size: var(--text-body);
      text-decoration: none;
    }
    .tabs a:hover {
      color: var(--ink-1);
    }
    .tabs a.active {
      border-bottom-color: var(--ink-1);
      color: var(--ink-1);
      font-weight: 600;
    }
    .tabs a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .layout {
      display: grid;
      gap: var(--space-4);
      margin-top: var(--space-4);
    }
    @media (min-width: 1024px) {
      /* 본문이 왼쪽, 목차가 오른쪽 320px — 마크업 순서는 목차가 먼저라 order 로 뒤집는다 */
      .layout {
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: var(--space-3);
      }
      article {
        order: 1;
      }
      aside {
        order: 2;
      }
    }

    aside {
      display: none;
    }
    @media (min-width: 1024px) {
      aside {
        display: block;
        position: sticky;
        top: 96px;
        align-self: start;
      }
    }
    aside p {
      margin: 0;
      color: var(--ink-1);
      font-size: var(--text-fine);
      font-weight: 600;
    }
    aside nav {
      display: grid;
      gap: var(--space-1);
      margin-top: var(--space-1);
    }
    aside a {
      color: var(--ink-2);
      font-size: var(--text-fine);
      text-decoration: none;
    }
    aside a:hover {
      color: var(--ink-1);
    }

    article {
      max-width: 680px;
      min-width: 0;
      line-height: 1.75;
      font-size: var(--text-body);
    }
    h1 {
      margin: 0;
      color: var(--ink-1);
      font-size: var(--text-page-title);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      line-height: 1.35;
    }
    .updated {
      margin: var(--space-1) 0 0;
      color: var(--ink-2);
      font-size: var(--text-fine);
    }
    h2 {
      margin: var(--space-4) 0 0;
      scroll-margin-top: 96px;
      color: var(--ink-1);
      font-size: var(--text-heading);
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
      line-height: 1.4;
    }
    p,
    li {
      color: var(--ink-2);
    }
    p {
      margin: var(--space-1) 0 0;
    }
    ul {
      margin: var(--space-1) 0 0;
      padding-left: var(--space-3);
      list-style: disc;
    }
    li + li {
      margin-top: 4px;
    }
    b {
      color: var(--ink-1);
      font-weight: 600;
    }
    .table-wrap {
      margin-top: var(--space-2);
      overflow-x: auto;
    }
    table {
      width: 100%;
      min-width: 420px;
      border-collapse: collapse;
      font-size: var(--text-fine);
    }
    th,
    td {
      padding: var(--space-1);
      border: 1px solid var(--border);
      text-align: left;
    }
    th {
      background: var(--surface-muted);
      color: var(--ink-1);
      font-weight: 600;
    }
    td {
      color: var(--ink-2);
    }
    .to-top {
      display: inline-flex;
      margin-top: var(--space-5);
      color: var(--ink-2);
      font-size: var(--text-fine);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .to-top:hover {
      color: var(--ink-1);
    }
  `;

  private get sections(): Section[] {
    return this.kind === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  }

  private scrollToSection(id: string, e: Event) {
    e.preventDefault();
    this.renderRoot.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth" });
  }

  render() {
    return html`
      <nav class="tabs" aria-label="정책 종류">
        <a
          href="/policy/terms"
          class=${this.kind === "terms" ? "active" : ""}
          aria-current=${this.kind === "terms" ? "page" : null}
          >이용약관</a
        >
        <a
          href="/policy/privacy"
          class=${this.kind === "privacy" ? "active" : ""}
          aria-current=${this.kind === "privacy" ? "page" : null}
          >개인정보 처리방침</a
        >
      </nav>

      <div class="layout">
        <aside>
          <p>목차</p>
          <nav aria-label=${this.kind === "privacy" ? "개인정보 처리방침 목차" : "이용약관 목차"}>
            ${this.sections.map(
              (s) => html`<a
                href="#${s.id}"
                @click=${(e: Event) => this.scrollToSection(s.id, e)}
                >${s.title}</a
              >`,
            )}
          </nav>
        </aside>

        ${this.kind === "privacy" ? this.renderPrivacy() : this.renderTerms()}
      </div>
    `;
  }

  private renderPrivacy() {
    return html`
      <article>
        <h1>개인정보 처리방침</h1>
        <p class="updated">시행일: 2026-11-02</p>

        <h2 id="privacy-1">1. 수집하는 개인정보 항목</h2>
        <ul>
          <li>
            <b>구글 계정 정보</b>: 이메일 주소, 이름 (구글 OAuth 로그인 시
            제공받는 정보)
          </li>
          <li>
            <b>계정 정보</b>: 이름, 휴대폰 번호 (최초 로그인 후 직접 입력)
          </li>
          <li><b>대여 이력</b>: 신청·수령·반납 기록</li>
        </ul>

        <h2 id="privacy-2">2. 수집 목적</h2>
        <ul>
          <li>회원 식별 및 로그인 (구글 계정)</li>
          <li>물품 대여 신청·수령·반납 과정의 연락 (휴대폰 번호)</li>
          <li>대여 이력 관리 및 분쟁 대응</li>
        </ul>

        <h2 id="privacy-3">3. 보관 기간 및 파기</h2>
        <p>
          대여 이력 보존을 위해 탈퇴(비활성화) 후에도 기록이 남아요. 개인정보는
          이용 목적이 소멸하면 지체 없이 파기하며, 보관 기간은 다음과 같아요.
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>보관 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>이메일·이름</td>
                <td>회원 활동 기간 + 탈퇴 후 1년</td>
              </tr>
              <tr>
                <td>휴대폰 번호</td>
                <td>회원 활동 기간 + 탈퇴 후 1년</td>
              </tr>
              <tr>
                <td>대여 이력</td>
                <td>관련 법령에 따라 보관 (분쟁 대응)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 id="privacy-4">4. 개인정보 제3자 제공</h2>
        <p>
          회원의 개인정보를 외부에 제공하지 않아요. 단, 법령에 근거한 요청이
          있는 경우 예외로 해요.
        </p>

        <h2 id="privacy-5">5. 개인정보 처리 위탁</h2>
        <p>서비스 운영을 위해 아래 사업자에 개인정보 처리를 위탁하고 있어요.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>수탁자</th>
                <th>위탁 업무</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Google LLC (OAuth)</td>
                <td>소셜 로그인 인증</td>
              </tr>
              <tr>
                <td>Cloudflare (호스팅·데이터베이스·이미지 저장)</td>
                <td>서비스 운영 인프라, 회원·대여 정보 및 이미지 저장</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 id="privacy-6">6. 회원 권리</h2>
        <p>
          회원은 언제든지 자신의 개인정보를 열람·수정할 수 있어요 (내 정보에서
          계정 정보 수정 가능). 탈퇴를 원하면 관리자에게 요청해 주세요 —
          비활성화 처리돼요.
        </p>

        <h2 id="privacy-7">7. 문의처</h2>
        <p>
          개인정보 보호 관련 문의: 운영진 담당자 (서비스 관리자에게 문의해
          주세요)
        </p>

        <a class="to-top" href="#top" @click=${(e: Event) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}>맨 위로</a>
      </article>
    `;
  }

  private renderTerms() {
    return html`
      <article>
        <h1>서비스 이용약관</h1>
        <p class="updated">시행일: 2026-09-10</p>

        <h2 id="terms-1">1. 목적</h2>
        <p>
          이 약관은 물품 대여 서비스(이하 “서비스”)의 이용 조건을 정해, 물품
          대여 절차와 회원·운영진의 권리·의무를 명확히 하는 데 목적이 있어요.
        </p>

        <h2 id="terms-2">2. 회원 가입</h2>
        <ul>
          <li>정토회 계정(@jungto.org)으로 로그인하면 바로 회원으로 가입돼요.</li>
          <li>대여 연락을 위해 휴대폰 번호 등록이 필요해요.</li>
          <li>서비스는 지부 회원 대상 — 정토회 계정이 아니면 로그인할 수 없어요.</li>
        </ul>

        <h2 id="terms-3">3. 물품 대여</h2>
        <ul>
          <li>물품은 신청 → 수령 → 반납 순서로 대여돼요.</li>
          <li>수령 전이면 언제든 신청을 취소할 수 있어요 (수령 후에는 불가).</li>
          <li>대여 기간은 물품별 최대 대여일을 넘을 수 없어요.</li>
          <li>반납일은 물품을 돌려주는 날이며, 그 전날까지 사용할 수 있어요.</li>
        </ul>

        <h2 id="terms-4">4. 회원 의무</h2>
        <ul>
          <li>물품을 반납일까지 관리하고 정시에 반납해요.</li>
          <li>고의·중과실로 물품을 훼손·분실하면 복구(구매) 책임이 있어요.</li>
          <li>반납일 경과(연체) 시 운영진이 연락할 수 있어요.</li>
          <li>연락처가 바뀌면 내 정보에서 수정해 주세요.</li>
        </ul>

        <h2 id="terms-5">5. 운영진 의무</h2>
        <ul>
          <li>대여 신청·반납을 공정하게 처리해요.</li>
          <li>물품 상태를 수령·반납 시점에 확인하고 기록해요.</li>
        </ul>

        <h2 id="terms-6">6. 책임 제한</h2>
        <ul>
          <li>사용 전 물품 상태를 확인해 주세요.</li>
          <li>
            서비스는 물품 대여 기록·연락 조율 도구이며, 물품 자체의 하자로 인한
            손해에 대해 배상 책임을 지지 않아요.
          </li>
        </ul>

        <h2 id="terms-7">7. 약관 변경</h2>
        <p>약관이 바뀌면 서비스 내 공지로 알려드려요.</p>

        <a class="to-top" href="#top" @click=${(e: Event) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}>맨 위로</a>
      </article>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-policy": PagePolicy;
  }
}
