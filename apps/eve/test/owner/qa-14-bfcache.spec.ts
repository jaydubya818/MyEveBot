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
 * a reload of the signed gate before the 5 s timeout.
 *
 * Revert-check: removing the `pageshow` listener from
 * owner-session-boundary.tsx causes the test to time out because
 * `window.location` is never changed by the synthetic event.
 */
import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";
const PASSWORD = "local-beta-ui-fixture-only";

test.beforeEach(async ({ context }) => {
  // Layout/session tests need real auth, but no DB or provider resource calls.
  await context.route("**/*", async route => {
    const url=new URL(route.request().url());
    if(url.origin!==BASE) return route.abort("blockedbyclient");
    if(/^\/(api|eve)\//.test(url.pathname) && !url.pathname.startsWith("/api/auth/")) {
      return route.fulfill({status:503,json:{error:"Unavailable in local viewport fixture"}});
    }
    return route.continue();
  });
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
  await expect(page.getByRole("heading", {name:"Today",exact:true})).toBeVisible();

  // 3. Invalidate the server session.
  expect((await context.request.post(`${BASE}/api/auth/logout`)).status()).toBe(200);
  expect((await (await context.request.get(`${BASE}/api/auth/status`)).json()).authenticated).toBe(false);

  // Reload through the signed gate when the browser restores cached private UI.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });

  // The invalid session must reach Login instead of stale private UI.
  await expect(page).toHaveURL(/login/, { timeout: 5000 });

  // 7. Confirm the loading text is not the final state.
  await expect(
    page.getByText("Opening your private workspace"),
  ).toHaveCount(0);
});


test("QA-14: persisted pageshow preserves a valid signed session", async ({page}) => {
  await page.goto(`${BASE}/today?from=history`, {waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Today",exact:true})).toBeVisible();
  const navigation=page.waitForEvent("framenavigated",{predicate:frame=>frame===page.mainFrame()});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
  await navigation;
  await expect(page).toHaveURL(`${BASE}/today?from=history`);
  await expect(page.getByRole("heading",{name:"Today",exact:true})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Password",exact:true})).toHaveCount(0);
});
