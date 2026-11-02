// 디자인 시안 전용 미리보기 바.
// 12개 페이지가 같은 바를 쓰도록 마크업·스타일·동작을 여기 한 곳에 둔다.
// 제품 UI가 아니므로 앱 번들에는 포함되지 않는다.
(() => {
  const SCREENS = [
    {
      group: "물품",
      items: [
        ["index.html", "물품 현황"],
        ["item-detail.html", "물품 상세"],
        ["item-form.html", "물품 등록"],
        ["item-form.html?mode=edit", "물품 수정"],
      ],
    },
    {
      group: "계정",
      items: [
        ["login.html", "로그인"],
        ["signup-profile.html", "프로필 등록"],
        ["mypage.html", "내 정보"],
      ],
    },
    {
      group: "대여·관리",
      items: [
        ["my-rentals.html", "대여 내역"],
        ["admin-reservations.html", "대여 관리"],
        ["admin-members.html", "회원 관리"],
      ],
    },
    {
      group: "정책·기타",
      items: [
        ["policy.html?kind=terms", "이용약관"],
        ["policy.html?kind=privacy", "개인정보 처리방침"],
        ["states.html", "상태 화면"],
        ["not-found.html", "404"],
      ],
    },
  ];

  const options = SCREENS.map(
    (group) =>
      `<optgroup label="${group.group}">${group.items
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("")}</optgroup>`,
  ).join("");

  const style = document.createElement("style");
  style.textContent = `
    /* 역할 전환은 모든 페이지에서 같은 규칙을 쓴다. */
    [data-role="member"] .admin-only {
      display: none !important;
    }
    [data-role="admin"] .member-only {
      display: none !important;
    }
    /* 관리자 전용 화면을 회원 역할로 열면 앱과 같이 권한 안내만 남긴다. */
    main.preview-denied > * {
      display: none !important;
    }
    main.preview-denied > .preview-guard {
      display: block !important;
    }
    .preview-guard {
      display: none;
      box-sizing: border-box;
      max-width: 520px;
      margin: 48px auto;
      padding: 32px 24px;
      border: 1px solid var(--color-line, #e5e7eb);
      border-radius: var(--radius-card, 8px);
      background: var(--color-surface, #fff);
      text-align: center;
    }
    .preview-guard-title {
      margin: 0;
      color: var(--color-ink-1, #111827);
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: -0.015em;
    }
    .preview-guard-text {
      margin: 8px 0 0;
      color: var(--color-ink-2, #4b5563);
      font-size: 1rem;
      line-height: 1.5;
    }
    .preview-guard-role {
      margin-top: 20px;
      padding: 8px 16px;
      border: 1px solid var(--color-line-strong, #d1d5db);
      border-radius: var(--radius-card, 8px);
      background: var(--color-surface, #fff);
      color: var(--color-ink-1, #111827);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      cursor: pointer;
    }
    .preview-guard-role:hover {
      background: var(--color-surface-muted, #f3f4f6);
    }
    .preview-guard-role:focus-visible {
      outline: 2px solid var(--color-primary, #ea580c);
      outline-offset: 2px;
    }
    /* 페이지의 @theme 토큰은 Tailwind가 쓰임새에 따라 지울 수 있다.
       미리보기 바는 어느 페이지에서도 같게 보여야 하므로 fallback 값을 둔다. */
    .preview-bar {
      border-bottom: 1px dashed var(--color-line-strong, #d1d5db);
      background: var(--color-surface-muted, #f3f4f6);
    }
    .preview-bar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-sizing: border-box;
      height: 40px;
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 16px;
    }
    @media (min-width: 640px) {
      .preview-bar-inner {
        padding: 0 24px;
      }
    }
    .preview-bar-label {
      color: var(--color-ink-2, #4b5563);
      font-size: 0.875rem;
      line-height: 1.5;
      white-space: nowrap;
    }
    .preview-bar-label-short {
      display: none;
    }
    .preview-bar-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .preview-bar-select {
      box-sizing: border-box;
      width: 180px;
      min-width: 0;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--color-line-strong, #d1d5db);
      border-radius: 8px;
      background: var(--color-surface, #fff);
      color: var(--color-ink-1, #111827);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      cursor: pointer;
    }
    .preview-bar-select:focus-visible {
      outline: 2px solid var(--color-primary, #ea580c);
      outline-offset: 2px;
    }
    .role-switch {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: var(--color-ink-1, #111827);
    }
    .role-btn {
      padding: 4px 8px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: rgba(255, 255, 255, 0.65);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      cursor: pointer;
      white-space: nowrap;
    }
    .role-btn:hover {
      color: #fff;
    }
    .role-btn[aria-pressed="true"] {
      background: #fff;
      color: var(--color-ink-1, #111827);
      font-weight: 600;
    }
    .role-btn:focus-visible {
      outline: 2px solid var(--color-primary, #ea580c);
      outline-offset: 2px;
    }
    @media (max-width: 639px) {
      .preview-bar-inner {
        gap: 8px;
      }
      .preview-bar-label-full {
        display: none;
      }
      .preview-bar-label-short {
        display: inline;
      }
      .preview-bar-controls {
        gap: 8px;
      }
      .preview-bar-select {
        width: 170px;
      }
    }
    @media print {
      .preview-bar {
        display: none !important;
      }
    }
  `;
  document.head.append(style);

  const bar = `
    <div class="preview-bar">
      <div class="preview-bar-inner">
        <span class="preview-bar-label">
          <span class="preview-bar-label-full">디자인 미리보기 <span class="preview-bar-note">— 실제 화면은 아닙니다</span></span>
          <span class="preview-bar-label-short">미리보기</span>
        </span>
        <div class="preview-bar-controls">
          <select id="preview-screen" class="preview-bar-select" aria-label="화면 이동">
            ${options}
          </select>
          <div class="role-switch" role="group" aria-label="역할 미리보기">
            <button type="button" class="role-btn" data-role-btn="member">회원</button>
            <button type="button" class="role-btn" data-role-btn="admin">관리자</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("afterbegin", bar);

  // 현재 화면을 셀렉트에 반영한다. 쿼리로 모드가 갈리는 화면은 함께 맞춘다.
  const file = location.pathname.split("/").pop() || "index.html";
  const params = new URLSearchParams(location.search);
  let current = file;
  if (file === "item-form.html") {
    current =
      params.get("mode") === "edit" ? "item-form.html?mode=edit" : "item-form.html";
  }
  if (file === "policy.html") {
    current =
      params.get("kind") === "terms"
        ? "policy.html?kind=terms"
        : "policy.html?kind=privacy";
  }

  const select = document.getElementById("preview-screen");
  select.value = current;
  select.addEventListener("change", () => {
    location.href = select.value;
  });

  // 역할 전환 — 홈·상세·상태의 관리자 전용 UI를 보여줄 때 쓴다.
  // 화면을 옮겨 다녀도 미리보기 역할이 유지되도록 sessionStorage에 남긴다.
  const root = document.documentElement;
  const ROLE_KEY = "preview-role";
  let storedRole = null;
  try {
    storedRole = sessionStorage.getItem(ROLE_KEY);
  } catch {
    // file:// 등 저장소를 쓸 수 없는 환경에서는 현재 값만 쓴다.
  }
  const role =
    storedRole === "admin" || storedRole === "member"
      ? storedRole
      : root.dataset.role === "admin"
        ? "admin"
        : "member";

  // 관리자 전용 화면 — 앱은 회원이 열면 홈으로 돌려보낸다(/?role=denied).
  // 미리보기에서는 보던 화면을 잃지 않도록 같은 자리에서 권한 안내만 띄운다.
  const ADMIN_SCREENS = new Set([
    "item-form.html",
    "admin-reservations.html",
    "admin-members.html",
  ]);
  const isAdminScreen = ADMIN_SCREENS.has(file);
  const main = document.querySelector("main");
  let guard = null;
  if (main && isAdminScreen) {
    guard = document.createElement("section");
    guard.className = "preview-guard";
    guard.setAttribute("role", "status");
    guard.innerHTML = `
      <h2 class="preview-guard-title">관리자 권한이 필요해요</h2>
      <p class="preview-guard-text">일반 회원 계정으로는 관리자 화면에 접근할 수 없어요.</p>
      <button type="button" class="preview-guard-role">관리자로 보기</button>
    `;
    main.append(guard);
  }

  const roleButtons = [...document.querySelectorAll("[data-role-btn]")];
  const setRole = (next) => {
    root.dataset.role = next;
    try {
      sessionStorage.setItem(ROLE_KEY, next);
    } catch {
      // 저장에 실패해도 화면 전환은 그대로 동작한다.
    }
    roleButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.roleBtn === next),
      );
    });
    if (main && isAdminScreen) {
      main.classList.toggle("preview-denied", next === "member");
    }
  };

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => setRole(button.dataset.roleBtn));
  });
  guard
    ?.querySelector(".preview-guard-role")
    .addEventListener("click", () => setRole("admin"));
  setRole(role);
})();
