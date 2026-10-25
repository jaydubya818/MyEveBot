/**
 * Viewport regression tests for QA-12, QA-22, QA-39.
 *
 * Runs against the owner fixture server (http://127.0.0.1:3091, no DB, no model).
 * Specify project via --project=mobile or --project=desktop, or run all.
 *
 * Each test fails when its corresponding CSS fix is reverted:
 *   QA-12: remove @media (max-height:499px) → sidebar position:static in landscape.
 *   QA-22: remove the touch-device font-size rule → computed size < 16px.
 *   QA-39: remove .owner-footer a { min-height: 44px } → link height < 44px.
 */
import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";
const PASSWORD = "local-beta-ui-fixture-only";

// Authenticate before each test using Playwright's API request (no Origin header).
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

// ──────────────────────────────────────────────────────────────────────────────
// QA-12 — Phone landscape: sidebar must be in overlay (fixed) mode
// ──────────────────────────────────────────────────────────────────────────────

test.describe("QA-12 landscape sidebar", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("sidebar is position:fixed in landscape (844×390) so chat is not collapsed", async ({ page }) => {
    await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });

    // Wait for the React app to hydrate: the data-chat-sidebar attribute is
    // added by chat.tsx and is the earliest reliable signal that the sidebar
    // is in the DOM after hydration.
    await page.locator("[data-chat-sidebar]").waitFor({ state: "attached", timeout: 20000 });

    const sidebar = page.locator("[data-chat-sidebar]");

    const position = await sidebar.evaluate((el) =>
      window.getComputedStyle(el).position,
    );
    // With the fix: position:fixed (overlay). Without fix: position:static.
    expect(position, "sidebar must be position:fixed in landscape").toBe("fixed");

    const visibility = await sidebar.evaluate((el) =>
      window.getComputedStyle(el).visibility,
    );
    // Sidebar must be hidden by default (user opens it on demand).
    expect(visibility, "sidebar must be hidden by default in landscape").toBe("hidden");

    // The sidebar-open button must be visible in landscape so the user can open the drawer.
    const toggle = page.getByRole("button", { name: "Open threads" }).first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-22 — Composer textarea font-size ≥ 16px on touch (prevents iOS Safari zoom)
// ──────────────────────────────────────────────────────────────────────────────

test.describe("QA-22 composer font size", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("composer textarea font-size >= 16px on touch device (390×844)", async ({ page }) => {
    await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });

    // Wait for the composer to be rendered.
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeAttached({ timeout: 15000 });

    const fontSize = await textarea.evaluate((el) =>
      parseFloat(window.getComputedStyle(el as HTMLElement).fontSize),
    );
    // Without the fix: 13px (iOS zooms on focus). With fix: max(16px, 1em).
    expect(fontSize, `composer font-size ${fontSize}px is below 16px`).toBeGreaterThanOrEqual(16);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-39 — ProductShell footer links ≥ 44px height on touch
// ──────────────────────────────────────────────────────────────────────────────

test.describe("QA-39 footer link tap targets", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("product-shell footer links are at least 44px tall at 390×844", async ({ page }) => {
    // /privacy uses ProductShell which renders the .owner-footer.
    await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });

    // Wait for footer to appear.
    const footer = page.locator("footer.owner-footer");
    await expect(footer).toBeAttached({ timeout: 15000 });

    const links = footer.locator("a");
    const count = await links.count();

    if (count === 0) {
      // Fallback: check /memory
      await page.goto(`${BASE}/memory`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("footer.owner-footer")).toBeAttached({ timeout: 15000 });
    }

    const linkCount = await page.locator("footer.owner-footer a").count();
    expect(linkCount, "footer must contain at least one link").toBeGreaterThan(0);

    for (let i = 0; i < linkCount; i++) {
      const link = page.locator("footer.owner-footer a").nth(i);
      const box = await link.boundingBox();
      if (box === null) continue;
      const label = await link.textContent();
      expect(
        box.height,
        `Footer link "${label?.trim()}" height ${box.height}px < 44px`,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});
