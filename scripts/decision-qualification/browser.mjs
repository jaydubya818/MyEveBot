import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(`${process.env.JEV_QA_TOOLS}/package.json`);
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");
const origin = process.env.JEV_QA_ORIGIN ?? "http://127.0.0.1:3217";
if (new URL(origin).hostname !== "127.0.0.1")
  throw new Error("Qualification must be local");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [];
const failedResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400)
    failedResponses.push({
      status: response.status(),
      path: new URL(response.url()).pathname,
    });
});
const results = [];
try {
  const threadId = "c0de0000-0000-4000-8000-000000000001";
  const updatedAt = Date.now();
  const seed = await context.request.put(`${origin}/api/threads/${threadId}`, {
    data: {
      title: "Local qualification",
      updatedAt,
      chat: { events: [], savedAt: updatedAt },
    },
  });
  if (!seed.ok()) throw new Error(`Thread fixture failed: ${seed.status()}`);
  await context.addInitScript(
    ({ threadId, updatedAt }) => {
      if (!localStorage.getItem("eve-web-threads")) {
        localStorage.setItem(
          "eve-web-threads",
          JSON.stringify({
            activeId: threadId,
            threads: [
              { id: threadId, title: "Local qualification", updatedAt },
            ],
          }),
        );
        localStorage.setItem(
          `eve-web-chat:${threadId}`,
          JSON.stringify({ events: [], savedAt: updatedAt }),
        );
      }
    },
    { threadId, updatedAt },
  );
  const available = await (
    await context.request.get(`${origin}/api/decision-intelligence`)
  ).json();
  const baseline = available.runs.find(
    (r) => r.environment === "local-fixture" && r.experiment === "V0_ORIGINAL",
  );
  await page.goto(`${origin}/manage/decision-intelligence?run=${baseline.id}`);
  await page
    .getByRole("heading", { name: "Synthetic benchmark", exact: true })
    .waitFor();
  await page.locator('[aria-busy="true"]').waitFor({ state: "detached" });
  results.push({
    name: "overview",
    passed: await page
      .getByText("6 of 7 Knowledge types evaluated.", { exact: false })
      .isVisible(),
  });
  const api = await page.request.get(
    `${origin}/api/decision-intelligence?run=${baseline.id}`,
  );
  const data = await api.json();
  if (
    api.status() !== 200 ||
    data.metrics.attempted !== 210 ||
    data.provider.status !== "Not configured"
  )
    throw new Error("Unexpected fixture overview");
  await page
    .getByText("Class performance and confusion matrix", { exact: true })
    .click();
  await page.getByLabel("Confidence threshold:", { exact: false }).focus();
  await page.keyboard.press("ArrowLeft");
  if ((await page.locator("#decision-threshold").inputValue()) !== "94")
    throw new Error("Keyboard threshold failed");
  await page
    .getByLabel("Show decisions", { exact: true })
    .selectOption("high-confidence-errors");
  await page.waitForResponse(
    (response) =>
      response.url().includes("filter=high-confidence-errors") &&
      response.status() === 200,
  );
  await page
    .getByRole("button", { name: "Inspect", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Inspect decision · Synthetic evaluation example",
    })
    .waitFor();
  await page.goBack();
  await page.reload();
  await page
    .getByRole("heading", { name: "Synthetic benchmark", exact: true })
    .waitFor();
  results.push({ name: "filter-inspect-back-refresh-keyboard", passed: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByText("Class performance and confusion matrix", { exact: true })
      .click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error(`${name} document overflow`);
    const audit = await new AxeBuilder({ page })
      .include("#decision-intelligence-content")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    results.push({
      name,
      overflow,
      accessibility: audit.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map((node) => node.target),
      })),
    });
    if (process.env.JEV_QA_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.JEV_QA_SCREENSHOTS}/${name}.png`,
      });
  }
  for (const route of [
    "/goals",
    "/knowledge",
    "/agents",
    "/results",
    "/review",
    "/manage",
    "/chat",
  ]) {
    await page.goto(`${origin}${route}`);
    await page.locator("main").first().waitFor();
    await page.waitForFunction(
      () =>
        (document.querySelector("main")?.textContent?.trim().length ?? 0) > 50,
    );
    results.push({ name: `surface-${route}`, passed: true });
  }
  const input = page.getByPlaceholder(/Message .+\.\.\./);
  await input.fill("Reply with a brief local qualification acknowledgement.");
  await input.press("Enter");
  await page
    .getByText("Local qualification response. No external model was called.", {
      exact: false,
    })
    .first()
    .waitFor({ timeout: 60000 });
  results.push({ name: "chat-streaming-local-gateway-fixture", passed: true });
} catch (error) {
  results.push({ name: "execution", passed: false, message: error.message });
} finally {
  await browser.close();
}
const report = { results, errors, failedResponses };
await writeFile(
  process.env.JEV_QA_REPORT ?? "/tmp/jev-browser-report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (
  errors.length ||
  failedResponses.length ||
  results.some((item) => item.passed === false || item.accessibility?.length)
)
  process.exitCode = 1;
