import { expect, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:3091";

/** Open the owner account menu after client hydration (mobile Menu is SSR'd closed). */
export async function openAccountMenu(page: Page, origin = BASE): Promise<void> {
  await page.goto(`${origin}/today`, { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Menu" });
  if (!(await menu.isVisible())) return;
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(async () => {
    if ((await nav.getAttribute("data-open")) === "true") return;
    await menu.click();
    expect(await nav.getAttribute("data-open")).toBe("true");
  }).toPass({ timeout: 15000 });
}
