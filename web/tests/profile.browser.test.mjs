import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let user = { id: "profile-fixture", name: "테스트 사용자", email: "profile@example.invalid", phone: null, role: "user", deactivated_at: null };
  const updates = [];
  let rejectSave = false;
  let holdSave = false;
  let releaseSave;
  let saveStarted;
  await page.route("**/api/me", route => route.fulfill({ json: { user } }));
  await page.route("**/api/items", route => route.fulfill({ json: { items: [], total: 0, available_total: 0, hasMore: false } }));
  await page.route("**/api/me/profile", async route => {
    assert.equal(route.request().method(), "PUT");
    const body = route.request().postDataJSON();
    updates.push(body);
    if (holdSave) await new Promise(resolve => { releaseSave = resolve; saveStarted(); });
    if (rejectSave) await route.fulfill({ status: 400, json: { error: "휴대폰 번호를 정확히 입력하세요" } });
    else {
      user = { ...user, ...body };
      await route.fulfill({ json: { ok: true } });
    }
  });
  const saved = () => page.waitForResponse(response => response.url().endsWith("/api/me/profile") && response.request().method() === "PUT", { timeout: 2000 });
  const base = server.resolvedUrls.local[0];

  await page.goto(base + "signup/profile");
  const signup = page.locator("page-signup-profile");
  await signup.getByLabel("휴대폰 번호").fill("010-0000-0000");
  const first = saved();
  await signup.getByRole("button", { name: "저장", exact: true }).click();
  assert.equal((await first).status(), 200);
  await page.waitForURL(base + "mypage");
  assert.deepEqual(updates, [{ name: "테스트 사용자", phone: "010-0000-0000" }]);
  await page.locator("page-mypage").getByText("profile@example.invalid · 010-0000-0000", { exact: true }).waitFor();
  console.log("PASS signup Save sends one PUT and refreshes the visible profile");

  const mypage = page.locator("page-mypage");
  await mypage.getByRole("button", { name: "수정", exact: true }).click();
  await mypage.getByLabel("휴대폰 번호").fill("010-0000-0001");
  const second = saved();
  await mypage.getByRole("button", { name: "저장", exact: true }).click();
  assert.equal((await second).status(), 200);
  await mypage.getByText("저장했어요", { exact: true }).waitFor();
  assert.equal(updates.length, 2);
  assert.equal(user.phone, "010-0000-0001");
  console.log("PASS profile editing Save persists and displays the updated number");

  await page.goto(base + "signup/profile");
  await signup.getByLabel("휴대폰 번호").fill("010-0000-0002");
  const keyboard = saved();
  await signup.getByLabel("휴대폰 번호").press("Enter");
  assert.equal((await keyboard).status(), 200);
  await page.waitForURL(base + "mypage");
  await mypage.getByRole("button", { name: "수정", exact: true }).waitFor();
  assert.equal(updates.length, 3);
  assert.equal(user.phone, "010-0000-0002");
  console.log("PASS Enter in the custom phone input submits the profile once");

  await mypage.getByRole("button", { name: "수정", exact: true }).click();
  await mypage.getByLabel("휴대폰 번호").fill("");
  await mypage.getByRole("button", { name: "저장", exact: true }).click();
  assert.equal(updates.length, 3);
  await mypage.getByLabel("휴대폰 번호").fill("123");
  rejectSave = true;
  const invalid = saved();
  await mypage.getByRole("button", { name: "저장", exact: true }).click();
  assert.equal((await invalid).status(), 400);
  await mypage.getByText(/휴대폰 번호를 정확히 입력하세요/).waitFor();
  assert.equal(user.phone, "010-0000-0002");
  console.log("PASS required input validation and server errors do not silently save invalid data");

  rejectSave = false;
  holdSave = true;
  await mypage.getByLabel("휴대폰 번호").fill("010-0000-0003");
  const started = new Promise(resolve => { saveStarted = resolve; });
  const pending = saved();
  await mypage.getByRole("button", { name: "저장", exact: true }).click();
  await started;
  assert.equal(await mypage.getByRole("button", { name: "저장", exact: false }).isDisabled(), true);
  await mypage.locator("form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  assert.equal(updates.length, 5);
  holdSave = false;
  releaseSave();
  assert.equal((await pending).status(), 200);
  await mypage.getByText("저장했어요", { exact: true }).waitFor();
  assert.equal(updates.length, 5);
  assert.equal(user.phone, "010-0000-0003");
  console.log("PASS in-flight saves are disabled and duplicate submits do not send duplicate PUTs");
} finally {
  await browser?.close();
  await server.close();
}
