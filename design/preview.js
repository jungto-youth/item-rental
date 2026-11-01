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
    .preview-bar {
      border-bottom: 1px dashed var(--color-line-strong);
      background: var(--color-surface-muted);
    }
    .preview-bar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-sizing: border-box;
      height: 40px;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
    }
    .preview-bar-label {
      color: var(--color-ink-2);
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
      border: 1px solid var(--color-line-strong);
      border-radius: 8px;
      background: var(--color-surface);
      color: var(--color-ink-1);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      cursor: pointer;
    }
    .preview-bar-select:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .role-switch {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: var(--color-ink-1);
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
      color: var(--color-ink-1);
      font-weight: 600;
    }
    .role-btn:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    @media (max-width: 639px) {
      .preview-bar-inner {
        gap: 8px;
        padding: 0 16px;
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
  const root = document.documentElement;
  const role = root.dataset.role === "admin" ? "admin" : "member";
  root.dataset.role = role;

  const roleButtons = [...document.querySelectorAll("[data-role-btn]")];
  const setRole = (next) => {
    root.dataset.role = next;
    roleButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.roleBtn === next),
      );
    });
  };

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => setRole(button.dataset.roleBtn));
  });
  setRole(role);
})();
