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
  const challenge = available.runs.find(
    (r) => r.experiment === "CHALLENGE_SEVEN",
  );
  const stress = available.runs.find((r) => r.experiment === "TAXONOMY_STRESS");
  await page.goto(`${origin}/manage/decision-intelligence?run=${challenge.id}`);
  await page
    .getByRole("heading", { name: /Knowledge Classification/ })
    .waitFor();
  await page
    .getByRole("heading", { name: "Matched six-versus-seven comparison" })
    .waitFor();
  await page.getByLabel("Confidence threshold:", { exact: false }).focus();
  await page.keyboard.press("ArrowLeft");
  if ((await page.locator("#challenge-threshold").inputValue()) !== "94")
    throw new Error("Threshold keyboard failed");
  await page
    .getByLabel("Difficulty", { exact: true })
    .selectOption("ADVERSARIAL");
  await page.getByText("83 matching cases.", { exact: false }).waitFor();
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
  await page.getByText("83 matching cases.", { exact: false }).waitFor();
  results.push({
    name: "challenge-filter-detail-back-refresh-keyboard",
    passed: true,
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const id of [challenge.id, stress.id]) {
      await page.goto(`${origin}/manage/decision-intelligence?run=${id}`);
      await page
        .getByRole("heading", { name: /Knowledge Classification/ })
        .waitFor();
      await page
        .locator("details")
        .evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
      if (
        id === stress.id &&
        (await page.locator("#challenge-threshold").count())
      )
        throw new Error("Stress simulator leaked");
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`${name} overflow`);
      const audit = await new AxeBuilder({ page })
        .include("#decision-intelligence-content")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      results.push({
        name: `${name}-${id === stress.id ? "stress" : "challenge"}`,
        accessibility: audit.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          nodes: nodes.map((n) => n.target),
        })),
      });
      if (process.env.JEV_QA_SCREENSHOTS)
        await page.screenshot({
          path: `${process.env.JEV_QA_SCREENSHOTS}/v05-${name}-${id === stress.id ? "stress" : "challenge"}.png`,
        });
    }
  }
  await page
    .getByLabel("Show decisions", { exact: true })
    .selectOption("review-disagreement");
  await page
    .getByRole("button", { name: "Inspect", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Inspect decision · Synthetic evaluation example",
    })
    .waitFor();
  await page
    .getByLabel("Evaluation run", { exact: true })
    .selectOption(challenge.id);
  await page.locator("#challenge-threshold").waitFor();
  if (new URL(page.url()).searchParams.has("filter"))
    throw new Error("Run switch retained stress filter");
  results.push({ name: "stress-detail-cohort-selection", passed: true });
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
