/**
 * Viewport regression tests for QA-12, QA-22, QA-39.
 *
 * Runs against the owner fixture server (http://127.0.0.1:3091, no DB, no model).
 * Specify project via --project=mobile or --project=desktop, or run all.
 *
 * Each test fails when its corresponding CSS fix is reverted:
 *   QA-12: remove @media (max-height:499px) → sidebar position:static in landscape.
 *   QA-22: remove the touch-device font-size rule → computed size < 16px.
 *   QA-39: remove .owner-account a { min-height: 44px } → link height < 44px.
 */
import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";
const PASSWORD = "local-beta-ui-fixture-only";

// Authenticate before each test using Playwright's API request (no Origin header).
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
    await toggle.click();
    await expect(sidebar).toBeVisible();
    const close = page.getByRole("button", { name: "Close navigation", exact: true });
    await expect(close).toBeVisible();
    await expect(page.locator("[data-sidebar-backdrop]")).toBeVisible();
    await expect.poll(() => sidebar.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => sidebar.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await close.click();
    await expect(sidebar).toBeHidden();
    await expect(toggle).toBeFocused();
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

test.describe("QA-39 current account navigation tap targets", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("current account links remain at least 44px tall without restoring the obsolete footer", async ({ page }) => {
    // Today resolves the server gate at request time. Privacy is prerendered
    // using the build's tester gate, while this owned fixture is non-alpha.
    await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", {name:"Menu",exact:true}).click();
    for (const name of ["Results", "Memory", "Activity", "Settings", "Privacy & boundaries"]) {
      const link=page.getByRole("navigation",{name:"Primary",exact:true}).getByRole("link",{name,exact:true});
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator("footer.owner-footer")).toHaveCount(0);
    await expect(page.getByTestId("deep-agent-unavailable")).toHaveCount(0);
  });
});
