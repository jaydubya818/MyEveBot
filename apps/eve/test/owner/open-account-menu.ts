import { expect, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";

/** Open the owner account menu after the client shell has hydrated. */
export async function openAccountMenu(page: Page, origin = BASE): Promise<void> {
  await page.goto(`${origin}/today`, { waitUntil: "load" });
  const nav = page.locator("nav.owner-primary");
  const menu = page.locator("button.owner-menu-toggle");
  await expect(nav).toBeAttached({ timeout: 15000 });
  await expect(menu).toBeAttached({ timeout: 15000 });
  const menuShown = await menu.evaluate((el) => getComputedStyle(el).display !== "none");
  if (!menuShown) return;
  await expect(async () => {
    if ((await nav.getAttribute("data-open")) === "true") return;
    await menu.click();
    await expect(nav).toHaveAttribute("data-open", "true");
  }).toPass({ timeout: 15000, intervals: [400] });
}
