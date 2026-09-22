// 확인 대화상자 — 네이티브 confirm() 대신 앱의 x-modal·x-button 조형으로 통일.
// Promise를 반환해 `if (!(await confirmDialog(...))) return;` 로 기존 흐름을 그대로 쓴다.
import { html, render } from "lit";
import "../components/ui/modal";
import "../components/ui/button";

export function confirmDialog(
  message: string,
  opts: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      host.remove();
      resolve(v);
    };
    const cancelBtn = document.createElement("x-button");
    cancelBtn.setAttribute("variant", "secondary");
    cancelBtn.setAttribute("slot", "footer");
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", () => done(false));
    const okBtn = document.createElement("x-button");
    okBtn.setAttribute("variant", opts.danger === false ? "primary" : "danger");
    okBtn.setAttribute("slot", "footer");
    okBtn.textContent = opts.confirmLabel ?? "확인";
    okBtn.addEventListener("click", () => done(true));

    render(
      html`<x-modal open title="확인" @close=${() => done(false)}></x-modal>`,
      host,
    );
    const modal = host.querySelector("x-modal");
    if (!modal) {
      done(false);
      return;
    }
    const p = document.createElement("p");
    p.textContent = message;
    p.style.margin = "0";
    modal.append(p, cancelBtn, okBtn);
    // 닫기(×)·백드롭도 취소로 처리 — modal이 close 이벤트를 내면 위에서 done(false)
  });
}
