import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({ configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)), server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const base = server.resolvedUrls.local[0];
  const admin = { id: "admin", name: "관리자", email: "admin@example.invalid", phone: "010-0000-0000", role: "admin", deactivated_at: null };
  let user = null;
  let inventoryReads = 0;
  const removed = [];
  let members = [
    { ...admin, created_at: "2026-01-01", active_rental_count: 0 },
    { id: "busy", name: "대여 중 회원", email: "busy@example.invalid", phone: null, role: "user", deactivated_at: "2026-01-01", created_at: "2026-01-01", active_rental_count: 1 },
    { id: "ready", name: "정리 회원", email: "ready@example.invalid", phone: null, role: "user", deactivated_at: "2026-01-01", created_at: "2026-01-01", active_rental_count: 0 },
  ];
  await page.route("**/api/me", route => route.fulfill({ json: { user } }));
  await page.route("**/api/dev/login", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/api/items*", route => { inventoryReads++; return route.fulfill({ json: { items: [], total: 0, available_total: 0, hasMore: false } }); });
  await page.route("**/api/admin/members", route => route.fulfill({ json: { members } }));
  await page.route("**/api/admin/allowed-emails", route => route.fulfill({ json: { allowedEmails: [] } }));
  await page.route("**/api/admin/members/*", async route => {
    assert.equal(route.request().method(), "DELETE");
    const id = route.request().url().split("/").pop();
    removed.push(id);
    members = members.filter(member => member.id !== id);
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto(base);
  await page.waitForURL(base + "login");
  assert.equal(inventoryReads, 0);
  await page.goto(base + "items/1");
  await page.waitForURL(base + "login");
  assert.equal(inventoryReads, 0);
  console.log("PASS anonymous home/detail navigation redirects before requesting inventory");

  user = admin;
  await page.goto(base + "admin/members");
  const management = page.locator("page-admin-members");
  const busy = management.locator('reservation-row[title="대여 중 회원"]');
  await busy.waitFor();
  assert.equal(await busy.getByRole("button", { name: "등록 정보 삭제", exact: true }).isDisabled(), true);
  await busy.getByText(/대여 중 1건/).waitFor();
  const ready = management.locator('reservation-row[title="정리 회원"]');
  await ready.getByRole("button", { name: "등록 정보 삭제", exact: true }).click();
  // Scope to the custom-element host so slotted message/footer content is included.
  const confirmation = page.locator("x-modal[open]");
  await confirmation.getByText(/완료된 이력은 익명으로 보존/).waitFor();
  await confirmation.getByRole("button", { name: "취소", exact: true }).click();
  assert.deepEqual(removed, []);
  await ready.getByRole("button", { name: "등록 정보 삭제", exact: true }).click();
  await confirmation.getByRole("button", { name: "등록 정보 삭제", exact: true }).click();
  await ready.waitFor({ state: "detached" });
  assert.deepEqual(removed, ["ready"]);
  await busy.waitFor();
  console.log("PASS member list disables deletion for active rentals and confirms eligible anonymization");

  user = null;
  await page.evaluate(async () => { const { navigate } = await import("/src/router.ts"); navigate("/"); });
  await page.waitForURL(base + "login");
  assert.equal(inventoryReads, 0);
  await page.goto(base + "login?error=AccountDeactivated");
  await page.getByText("탈퇴 처리된 계정이에요. 관리자에게 문의해주세요", { exact: true }).waitFor();
  console.log("PASS revoked sessions redirect on navigation and inactive login errors are visible");
} finally {
  await browser?.close();
  await server.close();
}
