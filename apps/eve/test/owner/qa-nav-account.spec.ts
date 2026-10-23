/**
 * QA-27 / QA-30 / QA-31 owner nav labels on the fixture server.
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

async function openAccountMenu(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}

test("QA-31: Sign out is reachable from the account menu", async ({ page }) => {
  await openAccountMenu(page);
  await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible({ timeout: 15000 });
});

test("QA-27: Deep Agent is labelled unavailable until qualified", async ({ page }) => {
  await openAccountMenu(page);
  await expect(page.getByTestId("deep-agent-unavailable")).toHaveText(
    /Deep Agent is unavailable until qualified/,
  );
});

test("QA-30: Memory and Results are distinct reachable account destinations", async ({
  page,
}) => {
  await openAccountMenu(page);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Memory" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Activity" })).toBeVisible();
});
