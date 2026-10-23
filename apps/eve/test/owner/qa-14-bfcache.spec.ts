/**
 * QA-14 — Back after sign-out must redirect to /login instead of hanging
 * on "Opening your private workspace…" (BFCache pageshow fix).
 */
import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";
const PASSWORD = "local-beta-ui-fixture-only";

test.beforeEach(async ({ context }) => {
  const response = await context.request.post(`${BASE}/api/auth/login`, {
    data: { password: PASSWORD },
  });
  expect(response.status()).toBe(200);
  const state = await context.storageState();
  await context.addCookies(state.cookies.map((c) => ({ ...c, secure: false })));
});

test("QA-14: pageshow with persisted:true after sign-out redirects to /login", async ({
  page,
  context,
}) => {
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/login/);
  await page.waitForFunction(() => !!document.querySelector("main"), { timeout: 15000 });
  await context.request.post(`${BASE}/api/auth/logout`);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(page).toHaveURL(/login/, { timeout: 5000 });
  await expect(page.getByText("Opening your private workspace")).toHaveCount(0);
});
