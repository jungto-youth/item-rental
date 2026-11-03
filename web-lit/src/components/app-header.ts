import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import { base } from "../styles/base";
import { reduceMotion } from "../styles/motion";
import { sheet } from "../styles/sheet";
import headerCss from "./app-header.css?inline";

type NavItem = { href: string; label: string };

// 앱 공통 헤더 — 브랜드·주 메뉴·계정 메뉴.
// 세션 구독은 app-shell이 소유하고, 이 컴포넌트는 user만 받아 그린다.
// :host를 sticky로 두어야 shadow root 안의 header가 페이지 전체 높이를
// 기준으로 고정된다(내부 header에 sticky를 걸면 host 높이에서만 고정된다).
@customElement("app-header")
export class AppHeader extends LitElement {
  @property({ attribute: false }) user: SessionUser | null = null;
  // 현재 경로 — app-shell 이 매 이동마다 새 값을 넘겨 활성 메뉴 밑줄을 다시 계산한다.
  // (user 만 받으면 경로가 바뀌어도 헤더가 다시 렌더되지 않아 밑줄이 멈춘다)
  @property() route = "";
  @state() private menuOpen = false;

  static styles = [base, sheet(headerCss), reduceMotion];

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pointerdown", this.onGlobalPointerDown);
    window.addEventListener("keydown", this.onGlobalKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointerdown", this.onGlobalPointerDown);
    window.removeEventListener("keydown", this.onGlobalKeydown);
    this.menuOpen = false;
  }

  // 모바일·데스크톱 모두 같은 상단 메뉴를 쓴다.
  // 관리자: 물품 현황 · 대여 관리 · 회원 관리 / 회원: 물품 현황 · 대여 기록
  private get navItems(): NavItem[] {
    if (!this.user) return [];
    const isAdmin = this.user.role === "admin";
    return [
      { href: "/", label: "물품 현황" },
      isAdmin
        ? { href: "/admin/reservations", label: "대여 관리" }
        : { href: "/my/rentals", label: "대여 기록" },
      ...(isAdmin ? [{ href: "/admin/members", label: "회원 관리" }] : []),
    ];
  }

  private isActive(href: string): boolean {
    const path = this.route || location.pathname;
    // 상세·등록·수정도 물품 현황 메뉴에 속한다 (시안과 같은 활성 표시)
    if (href === "/") return path === "/" || path.startsWith("/items");
    return path === href || path.startsWith(`${href}/`);
  }

  // 계정 메뉴 — 외부 클릭이나 Esc로 닫는다
  private onGlobalPointerDown = (e: PointerEvent) => {
    if (!this.menuOpen) return;
    if (!e.composedPath().includes(this)) this.menuOpen = false;
  };

  private onGlobalKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.menuOpen = false;
  };

  private async signOut() {
    this.menuOpen = false;
    // JWT 세션은 서버에 상태가 없다 — signout은 응답으로 쿠키를 지울 뿐이다.
    // 네트워크가 나빠도 버튼이 멈추지 않게 타임아웃을 두고, 실패해도 로컬 세션은 비운다
    // (쿠키가 남으면 다음 요청에서 다시 로그인 상태로 보일 수 있으나, 재시도 이전 상태보다 낫다).
    try {
      const csrfRes = await fetch("/api/auth/csrf", {
        signal: AbortSignal.timeout(10_000),
      });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // 네트워크 오류 — 서버 쿠키 삭제는 못 했지만 로그아웃 의사는 그대로 반영한다
    }
    session.clear();
    await session.refresh();
    navigate("/");
  }

  private get accountLabel(): string {
    return this.user?.name || this.user?.email || "";
  }

  private get accountInitial(): string {
    return this.accountLabel.trim().charAt(0).toUpperCase();
  }

  render() {
    const user = this.user;
    return html`
      <header>
        <div class="bar">
          <a href="/" class="brand" aria-label="물품 현황 — 홈">
            <img src="/logo.png" alt="" />
          </a>

          ${user
            ? html`
                <nav class="nav" aria-label="주 메뉴">
                  ${this.navItems.map(
                    (item) => html`
                      <a
                        href=${item.href}
                        class=${this.isActive(item.href) ? "active" : ""}
                        ?aria-current=${this.isActive(item.href) ? "page" : null}
                      >
                        ${item.label}
                      </a>
                    `,
                  )}
                </nav>
                <div class="account">
                  <button
                    class="account-btn"
                    aria-haspopup="menu"
                    aria-expanded=${this.menuOpen}
                    aria-label="계정 메뉴 — ${this.accountLabel}"
                    title="계정 메뉴"
                    @click=${() => (this.menuOpen = !this.menuOpen)}
                  >
                    <span class="avatar" aria-hidden="true">${this.accountInitial}</span>
                    <span class="account-name">${this.accountLabel}</span>
                    <svg
                      class="account-chevron"
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
                  </button>
                  ${this.menuOpen
                    ? html`
                        <div class="menu" role="menu">
                          <a
                            role="menuitem"
                            href="/mypage"
                            @click=${() => (this.menuOpen = false)}
                          >
                            내 정보
                          </a>
                          <button role="menuitem" class="menu-logout" @click=${this.signOut}>
                            로그아웃
                          </button>
                        </div>
                      `
                    : ""}
                </div>
              `
            : html`<a class="btn-login" href="/login">로그인</a>`}
        </div>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-header": AppHeader;
  }
}
