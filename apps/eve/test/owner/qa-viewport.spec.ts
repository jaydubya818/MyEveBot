/**
 * Viewport regression tests for QA-12, QA-22, QA-39.
 * Runs against the owner fixture server (http://127.0.0.1:3091).
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

test.describe("QA-12 landscape sidebar", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("sidebar is position:fixed in landscape (844×390) so chat is not collapsed", async ({
    page,
  }) => {
    await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-chat-sidebar]").waitFor({ state: "attached", timeout: 20000 });
    const sidebar = page.locator("[data-chat-sidebar]");
    const position = await sidebar.evaluate((el) => window.getComputedStyle(el).position);
    expect(position, "sidebar must be position:fixed in landscape").toBe("fixed");
    const visibility = await sidebar.evaluate((el) => window.getComputedStyle(el).visibility);
    expect(visibility, "sidebar must be hidden by default in landscape").toBe("hidden");
    const toggle = page.getByRole("button", { name: "Open threads" }).first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });
});

test.describe("QA-22 composer font size", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("composer textarea font-size >= 16px on touch device (390×844)", async ({ page }) => {
    await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeAttached({ timeout: 15000 });
    const fontSize = await textarea.evaluate((el) =>
      parseFloat(window.getComputedStyle(el as HTMLElement).fontSize),
    );
    expect(fontSize, `composer font-size ${fontSize}px is below 16px`).toBeGreaterThanOrEqual(16);
  });
});

test.describe("QA-39 account-menu tap targets", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("primary account controls are at least 44px tall at 390×844", async ({ page }) => {
    await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    const signOut = page.getByRole("button", { name: /Sign out/i });
    await expect(signOut).toBeVisible({ timeout: 15000 });
    const box = await signOut.boundingBox();
    expect(box, "Sign out must be visible").not.toBeNull();
    expect(box!.height, `Sign out height ${box!.height}px < 44px`).toBeGreaterThanOrEqual(44);
  });
});
