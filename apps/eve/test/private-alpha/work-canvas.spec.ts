import { test, expect, type Page } from "@playwright/test";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(
  import.meta.dirname,
  "../../../../output/playwright/work-canvas",
);
test.beforeEach(async ({ context, page }) => {
  const login = await context.request.post("/api/auth/login", {
    data: { password: "local-alpha-fixture-password" },
  });
  expect(login.status()).toBe(200);
  const state = await context.storageState();
  await context.addCookies(state.cookies.map((c) => ({ ...c, secure: false })));
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Canvas fixture has no API transport" },
    }),
  );
});
async function controls(page: Page) {
  const d = page.locator(".canvas-demo");
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open)))
    await d.locator("summary").click();
}
async function closeControls(page: Page) {
  const d = page.locator(".canvas-demo");
  if (await d.evaluate((e) => (e as HTMLDetailsElement).open))
    await d.locator("summary").click();
}
async function advance(page: Page, n = 4) {
  await controls(page);
  for (let i = 0; i < n; i++)
    await page
      .getByRole("button", { name: "Next sample step", exact: true })
      .click();
  await closeControls(page);
}
async function capture(page: Page, name: string, project: string) {
  await mkdir(output, { recursive: true });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(
    page.getByLabel("Continue with Sofie", { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "MyEve", exact: true }),
  ).toBeInViewport();
  await expect(page.locator(".canvas-header")).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.addScriptTag({
    path: "/private/tmp/private-alpha-qa/node_modules/axe-core/axe.min.js",
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.mode = t;
    }, theme);
    const violations = await page.evaluate(async () => {
      const result = await (window as any).axe.run({
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return result.violations.map((v: any) => ({
        id: v.id,
        targets: v.nodes.map((n: any) => n.target),
      }));
    });
    await appendFile(
      path.join(output, "accessibility.jsonl"),
      JSON.stringify({ name, project, theme, violations }) + "\n",
    );
    expect(violations).toEqual([]);
    await page.screenshot({
      path: path.join(output, `${project}-${name}-${theme}.png`),
    });
  }
}
test("engineering journey stays in one canvas with inline proof and continuation", async ({
  page,
}, info) => {
  const errors: string[] = [],
    writes: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/work-canvas");
  await expect(
    page.getByRole("region", { name: "Original request" }),
  ).toContainText("Fix the checkout retry bug");
  await capture(page, "engineering-request", info.project.name);
  for (const [i, label] of [
    "Sofie is investigating",
    "Software Engineer is implementing",
    "MyEve is verifying",
  ].entries()) {
    await advance(page, 1);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await capture(page, `engineering-stage-${i + 1}`, info.project.name);
  }
  await page.getByRole("button", { name: "Computer", exact: true }).click();
  await expect(
    page.getByText("This sample has no live computer session.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Computer", exact: true }).click();
  await advance(page, 1);
  await page
    .getByRole("region", { name: "Result", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Verified Result" }),
  ).toBeVisible();
  await expect(page.locator(".canvas-proof")).not.toHaveAttribute("open", "");
  await page
    .locator(".canvas-result")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await capture(page, "engineering-result", info.project.name);
  await page
    .locator(".canvas-decision")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await capture(page, "engineering-choices", info.project.name);
  await page
    .getByRole("radio", { name: "Open pull request", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm", exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, "engineering-decision", info.project.name);
  await page.locator(".canvas-proof summary").click();
  await page.locator(".canvas-proof").scrollIntoViewIfNeeded();
  await expect(page.getByText("WAITING_FOR_CANONICAL_Q37")).toBeVisible();
  await capture(page, "engineering-proof", info.project.name);
  await page.locator(".canvas-proof summary").click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".canvas-confirmed")).toBeFocused();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page
    .getByLabel("Continue with Sofie", { exact: true })
    .fill("Add a note about retry safety.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Continuation" }),
  ).toContainText("any new action needs its own review");
  await capture(page, "engineering-continuation", info.project.name);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  await expect(page).toHaveURL(/work-canvas$/);
});
for (const label of ["Push branch only", "Keep private", "Ask for changes"]) {
  test(`engineering choice: ${label}`, async ({ page }) => {
    await page.goto("/work-canvas");
    await advance(page);
    await page.getByRole("radio", { name: label, exact: true }).check();
    if (label === "Ask for changes") {
      await expect(
        page.getByRole("button", { name: "Confirm", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("What should change?")
        .fill("Cover timeout retries.");
    }
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `${label} · sample confirmed` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveCount(0);
  });
}
for (const [journey, choice] of [
  ["email", "Send reply"],
  ["research", "Create share link"],
  ["proactive", "Use October 14"],
]) {
  test(`${journey} result, bounded decision and continuation`, async ({
    page,
  }, info) => {
    const writes: string[] = [];
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
    });
    await page.goto(`/work-canvas?journey=${journey}`);
    await advance(page);
    await page.locator(".canvas-artifact summary").click();
    await page.locator(".canvas-artifact").scrollIntoViewIfNeeded();
    await capture(page, `${journey}-artifact`, info.project.name);
    await page.locator(".canvas-artifact summary").click();
    await page.getByRole("radio", { name: choice, exact: true }).check();
    await page
      .getByRole("button", { name: "Confirm", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, `${journey}-decision`, info.project.name);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `${choice} · sample confirmed` }),
    ).toBeVisible();
    await page
      .getByLabel("Continue with Sofie", { exact: true })
      .fill("Keep the next revision concise.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Continuation" }),
    ).toContainText("Keep the next revision concise.");
    await capture(page, `${journey}-continuation`, info.project.name);
    expect(writes).toEqual([]);
  });
}
test("failed checks and expired proposals cannot be confirmed", async ({
  page,
}, info) => {
  await page.goto("/work-canvas");
  await advance(page, 3);
  await controls(page);
  await page
    .getByRole("button", { name: "Simulate verification failure" })
    .click();
  await closeControls(page);
  await expect(
    page.getByRole("heading", { name: "Verified Result" }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page
    .locator(".canvas-stream")
    .getByRole("alert")
    .scrollIntoViewIfNeeded();
  await capture(page, "verification-failed", info.project.name);
  await page.getByRole("button", { name: "Retry sample verification" }).click();
  await advance(page, 1);
  await page
    .getByRole("radio", { name: "Open pull request", exact: true })
    .check();
  await controls(page);
  await page.getByRole("button", { name: "Expire sample decision" }).click();
  await closeControls(page);
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".canvas-stream")
    .getByRole("alert")
    .scrollIntoViewIfNeeded();
  await capture(page, "decision-expired", info.project.name);
  await page
    .getByRole("button", { name: "Request fresh sample review" })
    .click();
  await advance(page, 1);
  await expect(
    page.getByRole("radio", { name: "Open pull request", exact: true }),
  ).not.toBeChecked();
});
test("keyboard can choose and confirm; journey switch resets private sample", async ({
  page,
}) => {
  await page.goto("/work-canvas");
  await advance(page);
  await page
    .getByRole("radio", { name: "Open pull request", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Push branch only", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".canvas-confirmed")).toBeFocused();
  await controls(page);
  await page.getByRole("link", { name: "Email", exact: true }).click();
  await expect(page.getByText("Email received", { exact: true })).toBeVisible();
  await expect(page.locator(".canvas-confirmed")).toHaveCount(0);
});
