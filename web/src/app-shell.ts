import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRouter, navigate } from "./router";
import { session, type SessionUser } from "./context/session";
import { reduceMotion } from "./styles/motion";

// 테마 3단계(자동/라이트/다크) — tokens.css의 data-theme 셀렉터와 짝을 이룸.
// 저장값 'light'|'dark', 없으면 시스템 설정 따름.
type Theme = "system" | "light" | "dark";
const THEME_KEY = "theme";
// iOS 세그먼티드 컨트롤 문법 — 3개 상태가 아이콘으로 모두 보이고 원하는 것을 직접 누름(순환 없음)
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "테마 자동" },
  { value: "light", label: "라이트 모드" },
  { value: "dark", label: "다크 모드" },
];

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private user: SessionUser | null = null;
  @state() private theme: Theme = readStoredTheme();
  private unsubscribe: (() => void) | null = null;
  private router = createRouter(this);

  static styles = [
    reduceMotion,
    css`
      :host {
        display: block; /* 커스텀 엘리먼트 UA 기본값은 inline — 레이아웃 계산이 어긋나는 원인 */
      }
      header {
        --row-h: 44px; /* DESIGN.md §1 — Apple global-nav 44px */
        display: block; /* 두 줄: 1행 브랜드+계정 / 2행 메뉴 */
        background: var(
          --color-surface
        ); /* 테마 따름 — 라이트 화이트 / 다크 #1d1d1f */
        /* sticky는 부모 박스 안에서만 붙는다 — .row-nav에 sticky를 주면 부모 header가
         콘텐츠 높이와 같아 이동 여유가 0이라 못 붙음. 그래서 sticky는 header 자체에 걸고,
         1행만큼 위로 밀린 지점에 고정: 스크롤하면 1행은 화면 위로 밀려나가고 2행만 상단에 남음 */
        position: sticky;
        top: calc(-1 * var(--row-h));
        z-index: 10;
      }
      /* --- 1행: 브랜드 + 계정/로그인 + 테마 세그먼트 — 헤더가 -44px까지 올라가며 자연스럽게 밀려나감 --- */
      .row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        box-sizing: border-box;
        min-height: var(--row-h);
        padding: 0 var(--space-4);
        /* 헤어라인 — border 대신 inset 그림자: 레이아웃에 참여하지 않아 행이 진짜 44px,
         header top:-44px 고정점 계산이 정확히 성립 (min-height는 하한이라 border를 흡수 못 함) */
        box-shadow: inset 0 -1px var(--color-border);
      }
      /* --- 2행: 메뉴 네비 — 헤더가 고정되면 화면 상단에 남는 행 --- */
      .row-nav {
        display: flex;
        align-items: center;
        box-sizing: border-box;
        min-height: var(--row-h);
        padding: 0 var(--space-4);
        box-shadow: inset 0 -1px var(--color-border);
      }
      .brand {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        text-decoration: none;
        line-height: 44px;
      }
      .brand img {
        display: block;
        width: 26px;
        height: 26px; /* 계정 아바타(26px)와 같은 높이 — 1행 시각 리듬 통일 */
        border-radius: var(
          --radius-pill
        ); /* 로고를 원형 칩으로 — 아바타와 같은 문법 */
        background: var(--color-bg); /* 점선 사이 비치는 배경 통일 */
      }
      nav {
        display: flex;
        gap: var(--space-4);
        align-items: center;
        flex-wrap: nowrap;
        justify-content: flex-start;
        flex: 1;
        min-width: 0; /* flex 안에서 overflow-x가 동작하려면 필요 */
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none; /* 스크롤바 숨김 — 스와이프 제스처로 탐색 */
      }
      nav::-webkit-scrollbar {
        display: none;
      }
      nav a,
      nav button {
        background: none;
        border: none;
        padding: 0;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-muted);
        text-decoration: none;
        font-size: var(--text-fine); /* 12px — Apple nav-link */
        line-height: 44px;
        white-space: nowrap; /* 링크 텍스트 줄바꿈 금지 — 좌우 스크롤 */
        flex-shrink: 0; /* 좁아져도 항목이 눌리지 않게 */
      }
      nav a:hover,
      nav button:hover {
        color: var(--color-text);
      }
      /* --- 계정 칩 + 로그아웃 + 테마 세그먼트 — 1행 오른쪽 그룹 --- */
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      /* 비회원 로그인 버튼 — 계정 칩과 같은 자리, 고스트 필(보조 CTA 문법) */
      .btn-login {
        display: flex;
        align-items: center;
        height: 34px; /* 계정 칩(아바타 26 + 여백 8 + 보더 2)과 같은 높이 — 행 정렬 통일 */
        padding: 0 var(--space-4);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-pill);
        background: transparent;
        color: var(--color-primary);
        text-decoration: none;
        font-family: inherit;
        font-size: var(--text-caption);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .btn-login:active {
        transform: scale(0.95);
      }
      /* --- 계정 칩 — 아바타+이름 한 칩, 메뉴 링크(muted 텍스트)와 시각적 문법을 달리함 --- */
      .chip {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-shrink: 0;
        padding: 3px 10px 3px 3px; /* 아바타가 칩 좌측에 밀착 — pill 안쪽 여백 */
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        background: var(--color-surface);
        cursor: pointer;
        font-family: inherit;
        transition: transform 0.15s ease;
      }
      .chip:hover {
        background: var(--color-bg);
      }
      .chip:active {
        transform: scale(0.96);
      }
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: var(--radius-pill);
        background: var(
          --color-primary
        ); /* Action Blue — 계정 = 클릭 가능(마이페이지) */
        color: var(--color-primary-text);
        font-size: 12px;
        font-weight: 600;
      }
      .chip-name {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-text);
        font-size: var(--text-caption);
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
      }
      .btn-logout {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        padding: 0;
        background: none;
        border: none;
        border-radius: var(--radius-pill);
        cursor: pointer;
        color: var(--color-muted);
        transition: color 0.2s ease;
      }
      .btn-logout:hover {
        color: var(--color-danger);
        background: var(--color-bg);
      }
      .btn-logout svg {
        width: 16px;
        height: 16px;
        display: block;
      }
      @media (max-width: 560px) {
        .chip {
          padding-right: 3px;
        } /* 이름 숨김 → 아바타만 — gap이 그룹 내 간격 담당 */
        .chip-name {
          display: none;
        }
        .btn-logout {
          width: 30px;
          height: 30px;
          margin-left: 0;
        }
      }

      /* --- 테마 세그먼티드 컨트롤 — 1행 오른쪽 그룹(.actions) 안에서 gap으로 간격 --- */
      .seg {
        position: relative;
        display: flex;
        flex-shrink: 0;
        padding: 2px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        background: var(--color-bg); /* 트랙 = 캔버스 톤, 썸 = 서피스 */
      }
      .seg-thumb {
        position: absolute;
        box-sizing: border-box; /* 보더 포함 폭 계산 — 없으면 1px 보더만큼 커져 마지막 세그먼트에서 삐져나옴 */
        top: 2px;
        bottom: 2px;
        left: 2px;
        width: calc((100% - 4px) / 3);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        transition: transform 0.2s ease; /* 선택 세그먼트로 미끄러지는 썸 */
      }
      .seg button {
        position: relative; /* 썸 위에 아이콘 */
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 24px;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-muted);
        transition: color 0.2s ease;
      }
      .seg button.on {
        color: var(--color-text);
      }
      .seg button:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 1px;
        border-radius: var(--radius-pill);
      }
      .seg svg {
        width: 14px;
        height: 14px;
        display: block;
      }
      main {
        max-width: 640px;
        margin: 0 auto;
        padding: var(--space-4);
        font-size: var(--text-body); /* 본문 17px 기본 (DESIGN.md §4) */
        line-height: 1.47;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    // 구독만 걸면 이미 로드된 세션을 놓친다 (핫 리로드, 다른 코드의 선행 ensure)
    this.user = session.user;
    session.ensure();
    this.unsubscribe = session.subscribe(() => {
      this.user = session.user;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  // 세그먼트 직접 선택 — 자동이면 저장값을 지워 시스템 설정 추종
  private setTheme(t: Theme) {
    this.theme = t;
    try {
      if (t === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      // 저장 불가 환경에서도 세션 내 선택은 유지
    }
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = t;
  }

  // Auth.js 확인 페이지를 거치지 않고 바로 POST signout
  private async signOut() {
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // 네트워크 오류가 나도 세션 갱신 시도는 진행
    }
    session.clear();
    await session.refresh();
    navigate("/");
  }

  // 세그먼트 아이콘 — 자동(반원), 라이트(해), 다크(초승달)
  private themeIcon(t: Theme) {
    if (t === "light") {
      return html`<svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>`;
    }
    if (t === "dark") {
      return html`<svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>`;
    }
    return html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>`;
  }

  // 라디오그룹 표준 — 좌우/상하 화살표로 이동하며 즉시 선택. Tab은 그룹에 1회만 (roving tabindex)
  private onSegKey(e: KeyboardEvent) {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const idx = THEME_OPTIONS.findIndex((o) => o.value === this.theme);
    const next =
      THEME_OPTIONS[(idx + dir + THEME_OPTIONS.length) % THEME_OPTIONS.length];
    this.setTheme(next.value);
    void this.updateComplete.then(() => {
      this.renderRoot
        .querySelector<HTMLButtonElement>(`[data-theme-value="${next.value}"]`)
        ?.focus();
    });
  }

  private renderThemeSeg() {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === this.theme);
    return html`
      <div
        class="seg"
        role="radiogroup"
        aria-label="화면 테마"
        title="화면 테마"
      >
        <span
          class="seg-thumb"
          style=${`transform: translateX(${idx * 100}%)`}
          aria-hidden="true"
        ></span>
        ${THEME_OPTIONS.map(
          (o) => html`
            <button
              type="button"
              role="radio"
              class=${this.theme === o.value ? "on" : ""}
              aria-checked=${this.theme === o.value}
              tabindex=${this.theme === o.value ? 0 : -1}
              data-theme-value=${o.value}
              aria-label=${o.label}
              title=${o.label}
              @click=${() => this.setTheme(o.value)}
              @keydown=${this.onSegKey}
            >
              ${this.themeIcon(o.value)}
            </button>
          `,
        )}
      </div>
    `;
  }

  // 계정 칩 라벨 — 이름 없으면 이메일로 표시
  private get accountLabel(): string {
    return this.user?.name || this.user?.email || "";
  }
  private get accountInitial(): string {
    return this.accountLabel.trim().charAt(0).toUpperCase();
  }

  render() {
    return html`
      <header>
        <div class="row-top">
          <a href="/" class="brand" aria-label="홈 — 청년지부 물품 대여">
            <img src="/logo.png" alt="" />
          </a>
          <div class="actions">
            ${
              this.user
                ? html`
                    <button
                      class="chip"
                      title="마이페이지"
                      aria-label="마이페이지 — ${this.accountLabel}"
                      @click=${() => navigate("/mypage")}
                    >
                      <span class="avatar" aria-hidden="true"
                        >${this.accountInitial}</span
                      >
                      <span class="chip-name">${this.accountLabel}</span>
                    </button>
                    <button
                      class="btn-logout"
                      title="로그아웃"
                      aria-label="로그아웃"
                      @click=${this.signOut}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  `
                : html`<a class="btn-login" href="/login">로그인</a>`
            }
            ${this.renderThemeSeg()}
          </div>
        </div>
        <div class="row-nav">
          <nav>
            <a href="/">물품 대여</a>
            ${
              this.user && this.user.role === "admin"
                ? html`<a href="/admin">대시보드</a
                    ><a href="/admin/reservations">대여 관리</a
                    ><a href="/admin/history">대여 이력</a
                    ><a href="/admin/members">회원 관리</a>`
                : ""
            }
          </nav>
        </div>
      </header>
      <main>${this.router.outlet()}</main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
