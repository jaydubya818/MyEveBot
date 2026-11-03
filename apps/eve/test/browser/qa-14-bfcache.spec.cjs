'use strict';
const { test, expect } = require('@playwright/test');

/**
 * QA-14 — Back after sign-out must not hang on "Opening your private workspace…"
 *
 * The fix adds a `pageshow` listener with `persisted:true` so that
 * Back-Forward Cache (BFCache) page restorations are treated as auth changes
 * and immediately redirect to /login.
 *
 * Revert-check: removing the `onPageShow` listener from owner-session-boundary.tsx
 * causes the page to stay stuck on "Opening your private workspace…" instead
 * of redirecting, failing the `expect(page).toHaveURL(/login/)` assertion.
 *
 * Guard: requires the local browser-test server (MYEVE_BROWSER_TEST=1).
 */
test.skip(
  process.env.MYEVE_BROWSER_TEST !== '1',
  'Requires the local browser-test server; set MYEVE_BROWSER_TEST=1 to enable',
);

const PASSWORD = process.env.MYEVE_TEST_PASSWORD || 'local-beta-ui-fixture-only';

async function login(page, baseURL) {
  await page.goto(baseURL + '/login');
  await page.getByRole('textbox').fill(PASSWORD);
  await page.getByRole('button', { name: /open sofie|sign in/i }).click();
  await expect(page).toHaveURL(/(?!.*login)/);
}

test('QA-14: pressing Back after sign-out redirects to /login instead of hanging', async ({ page }) => {
  const baseURL = page.context().browser()?.defaultBrowserType() ? undefined : 'http://localhost:3091';

  // 1. Log in and navigate to /settings.
  await login(page, baseURL ?? '');
  await page.goto((baseURL ?? '') + '/settings');
  await page.waitForLoadState('networkidle');

  // 2. Sign out (navigate to /login).
  await page.goto((baseURL ?? '') + '/api/auth/logout', { method: 'POST' }).catch(() => {});
  // Trigger the sign-out from the page if direct POST isn't available.
  try {
    const btn = page.getByRole('button', { name: /sign out/i });
    if (await btn.isVisible()) await btn.click();
  } catch { /* settings panel may not be visible */ }
  await page.goto((baseURL ?? '') + '/login');
  await expect(page).toHaveURL(/login/);

  // 3. Simulate Back navigation (BFCache restoration of /settings).
  await page.goBack();

  // 4. After BFCache or normal navigation, the page must NOT hang —
  //    it must redirect to /login within 5 seconds.
  await expect(page).toHaveURL(/login/, { timeout: 5000 });

  // 5. The loading text must NOT be the final visible state.
  const loadingText = await page.getByText('Opening your private workspace').count();
  expect(loadingText).toBe(0);
});
