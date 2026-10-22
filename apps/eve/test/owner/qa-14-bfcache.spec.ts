/**
 * QA-14 — Back after sign-out must redirect to /login instead of hanging
 *   on "Opening your private workspace…" (BFCache pageshow fix).
 *
 * Runs against the owner fixture server (http://127.0.0.1:3091).
 *
 * Revert-check: removing the `pageshow` listener from
 * owner-session-boundary.tsx causes the assertion
 * `expect(page).toHaveURL(/login/)` to time out (page stays stuck on the
 * loading text indefinitely).
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
  await context.addCookies(
    state.cookies.map((c) => ({ ...c, secure: false })),
  );
});

test("QA-14: Back after sign-out redirects to /login, not stuck on loading", async ({ page }) => {
  // 1. Navigate to /today so it enters the browser history stack.
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/login/);

  // 2. Sign out. The fixture server accepts POST /api/auth/logout.
  await page.request.post(`${BASE}/api/auth/logout`);

  // 3. Navigate to /login explicitly (mirrors what the Sign out button does).
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/login/);

  // 4. Go Back — the browser may restore /today from BFCache.
  await page.goBack({ waitUntil: "commit" });

  // 5. The OwnerSessionBoundary pageshow listener must immediately fire a
  //    redirect to /login rather than leaving the page stuck.
  //    Timeout is intentionally short (5 s) to surface the hang quickly.
  await expect(page).toHaveURL(/login/, { timeout: 5000 });

  // 6. The loading copy must not be the final visible state.
  await expect(
    page.getByText("Opening your private workspace"),
  ).toHaveCount(0);
});
