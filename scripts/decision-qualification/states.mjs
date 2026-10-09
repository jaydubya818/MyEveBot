import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(`${process.env.JEV_QA_TOOLS}/package.json`);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = "http://127.0.0.1:3217";
  const response = await page.request.get(
    `${origin}/api/decision-intelligence`,
  );
  const populated = await response.json();
  let state = "loading";
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/decision-intelligence*", async (route) => {
    if (state === "loading") await waiting;
    if (state === "failed")
      return route.fulfill({
        status: 503,
        json: { error: "Injected local qualification failure" },
      });
    return route.fulfill({
      json: {
        ...populated,
        runs: [],
        run: null,
        metrics: null,
        rows: [],
        total: 0,
        simulation: [],
        detail: null,
      },
    });
  });
  await page.goto(`${origin}/manage/decision-intelligence`);
  await page
    .getByRole("status")
    .filter({ hasText: "Loading Decision Intelligence" })
    .waitFor();
  state = "empty";
  release();
  await page
    .getByRole("heading", { name: "No Decision Intelligence evidence yet" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /Activate|Promote|Use Jev/ })
      .count(),
    0,
  );
  state = "failed";
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Decision Intelligence data couldn’t be loaded" })
    .waitFor();
  state = "empty";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByRole("heading", { name: "No Decision Intelligence evidence yet" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: loading, unconfigured empty state, injected 503 error, retry recovery, no activation controls, no uncaught page errors. One intentional 503 is expected in this failure-state test.",
  );
} finally {
  await browser.close();
}
