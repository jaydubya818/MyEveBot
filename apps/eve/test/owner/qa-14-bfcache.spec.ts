/**
 * QA-14 — Back after sign-out must redirect to /login instead of hanging
 *   on "Opening your private workspace…" (BFCache pageshow fix).
 *
 * Runs against the owner fixture server (http://127.0.0.1:3091).
 *
 * Strategy: after loading /today and invalidating the session, dispatch
 * a synthetic `pageshow` event with `persisted: true` to exercise the
 * exact listener added by the fix without depending on real BFCache
 * support in headless Chromium. The test verifies that the listener calls
 * `window.location.replace('/login?...')` before the 5 s timeout.
 *
 * Revert-check: removing the `pageshow` listener from
 * owner-session-boundary.tsx causes the test to time out because
 * `window.location` is never changed by the synthetic event.
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

test("QA-14: pageshow with persisted:true after sign-out redirects to /login", async ({ page, context }) => {
  // 1. Navigate to /today so the OwnerSessionBoundary renders and mounts
  //    its pageshow listener.
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/login/);

  // 2. Wait for the app to be interactive (so the useEffect listener is wired).
  await page.waitForFunction(() => !!document.querySelector("main"), { timeout: 15000 });

  // 3. Invalidate the server session.
  await context.request.post(`${BASE}/api/auth/logout`);

  // 4. Remove the session cookie so the client-side check also sees
  //    the session as gone (the pageshow listener calls /api/auth/status
  //    after invalidation via the OWNER_BROWSER_EVENT storage path,
  //    but the pageshow path calls changed() directly which uses
  //    window.location.replace('/login?...')).
  // We don't need to clear cookies here — the pageshow listener itself
  // calls changed() → window.location.replace('/login') unconditionally.

  // 5. Fire a synthetic pageshow event with persisted:true.
  //    This is the exact event BFCache fires when restoring a cached page.
  //    The fix adds: window.addEventListener('pageshow', e => { if (e.persisted) changed(); })
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });

  // 6. The pageshow listener must call window.location.replace('/login?...')
  //    within 5 s. Playwright will observe the navigation.
  await expect(page).toHaveURL(/login/, { timeout: 5000 });

  // 7. Confirm the loading text is not the final state.
  await expect(
    page.getByText("Opening your private workspace"),
  ).toHaveCount(0);
});
