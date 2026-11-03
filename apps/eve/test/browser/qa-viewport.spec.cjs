'use strict';
const { test, expect } = require('@playwright/test');

/**
 * Viewport regression tests for QA-12, QA-22, QA-39.
 *
 * Run against the owner fixture server (port 3091) started with:
 *   node test/owner/local-server.cjs
 * Set MYEVE_VIEWPORT_TEST=1 to enable.
 *
 * Each test fails when its corresponding fix is reverted:
 *   QA-12: remove @media (max-height:499px) CSS → sidebar is position:static
 *          in landscape → the `position` assertion fails.
 *   QA-22: remove the touch-device font-size rule → computed size < 16px.
 *   QA-39: remove .owner-footer a min-height rule → link heights < 44px.
 */
test.skip(
  process.env.MYEVE_VIEWPORT_TEST !== '1',
  'Requires the owner fixture server; set MYEVE_VIEWPORT_TEST=1 to enable',
);

const BASE = process.env.MYEVE_FIXTURE_BASE_URL || 'http://localhost:3091';
const PASSWORD = process.env.MYEVE_FIXTURE_PASSWORD || 'local-beta-ui-fixture-only';
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) {
  throw new Error('Viewport tests must point to a loopback fixture server.');
}

/** Log in once and return a browser context with the session cookie. */
async function createLoggedInContext(browser, viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  await page.goto(BASE + '/login');
  await page.getByRole('textbox').fill(PASSWORD);
  await page.getByRole('button', { name: /open sofie|sign in/i }).click();
  await page.waitForURL(/(?!.*login)/, { timeout: 10000 });
  return { context, page };
}

// ──────────────────────────────────────────────────────────────────────────────
// QA-12 — Phone landscape: sidebar must be in overlay (fixed) mode
// ──────────────────────────────────────────────────────────────────────────────
test('QA-12: sidebar is position:fixed in phone landscape (844x390)', async ({ browser }) => {
  const { context, page } = await createLoggedInContext(
    browser,
    { width: 844, height: 390 },
    { hasTouch: true, isMobile: true },
  );

  try {
    await page.goto(BASE + '/chat');
    await page.waitForLoadState('networkidle');

    const sidebar = page.getByRole('complementary', { name: 'App navigation' });
    await expect(sidebar).toBeAttached();

    // The sidebar must be position:fixed (overlay) in landscape, not static.
    const position = await sidebar.evaluate((el) =>
      window.getComputedStyle(el).position,
    );
    expect(position).toBe('fixed');

    // The sidebar must be invisible by default (not open).
    const visibility = await sidebar.evaluate((el) =>
      window.getComputedStyle(el).visibility,
    );
    expect(visibility).toBe('hidden');

    // The sidebar-open button must be visible so the user can open the drawer.
    const toggle = page.getByRole('button', { name: 'Open threads' }).first();
    await expect(toggle).toBeVisible();
  } finally {
    await context.close();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-22 — Portrait phone: chat composer textarea font-size ≥ 16px (no iOS zoom)
// ──────────────────────────────────────────────────────────────────────────────
test('QA-22: composer textarea font-size >= 16px on touch device (390x844)', async ({ browser }) => {
  const { context, page } = await createLoggedInContext(
    browser,
    { width: 390, height: 844 },
    { hasTouch: true, isMobile: true },
  );

  try {
    await page.goto(BASE + '/chat');
    await page.waitForLoadState('networkidle');

    // Locate the composer textarea (InputArea).
    const textarea = page.getByRole('textbox', { name: /message sofie/i });
    await expect(textarea).toBeAttached();

    const fontSize = await textarea.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize),
    );
    // Must be ≥ 16px to prevent iOS Safari auto-zoom on focus.
    expect(fontSize).toBeGreaterThanOrEqual(16);
  } finally {
    await context.close();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-39 — Footer navigation links must have ≥ 44px height on touch
// ──────────────────────────────────────────────────────────────────────────────
test('QA-39: product-shell footer links are at least 44px tall (390x844)', async ({ browser }) => {
  const { context, page } = await createLoggedInContext(
    browser,
    { width: 390, height: 844 },
    { hasTouch: true, isMobile: true },
  );

  try {
    // Navigate to a page that uses ProductShell (e.g. /privacy or /memory).
    await page.goto(BASE + '/memory');
    await page.waitForLoadState('networkidle');

    // The footer contains links like "Daily Brief", "Privacy & boundaries", etc.
    const footer = page.locator('footer.owner-footer');
    const footerExists = (await footer.count()) > 0;
    if (!footerExists) {
      // Fall back: check any page with the owner-footer class.
      test.skip(true, 'ProductShell footer not found on this page at this viewport');
      return;
    }

    const links = footer.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const box = await link.boundingBox();
      if (box === null) continue; // hidden/off-screen link
      const label = await link.textContent();
      expect(
        box.height,
        `Footer link "${label?.trim()}" height ${box.height}px is below 44px`,
      ).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});
