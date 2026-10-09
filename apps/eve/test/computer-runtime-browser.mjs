import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createWebSessionToken } from "../lib/web-auth.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = "http://127.0.0.1:3317";
const evidence = new URL("../../../docs/qa/computer-template-lifecycle/", import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const results = [];
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "myeve_session", value: createWebSessionToken({ MYEVE_ACCESS_PASSWORD: "local-qualification", MYEVE_SESSION_SECRET: "local-qualification-only-secret-long-enough" }), url: origin }]);
    const page = await context.newPage();
    // All browser traffic stays local; only the readiness response is a deterministic fixture.
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    let state = "COLD";
    await page.route("**/api/computer-runtime", route => route.fulfill({ json: { state, cleanupFailures: 0 } }));
    for (const [next, title] of [["COLD", "Computer is ready to start"], ["PREPARING", "Preparing Computer…"], ["READY", "Computer is ready"], ["UNAVAILABLE", "Computer couldn’t be prepared"]]) {
      state = next;
      await page.goto(`${origin}/computer`);
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      const region = page.getByRole("region", { name: "Computer runtime", exact: true });
      assert.equal(await region.count(), 1);
      const box = await region.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal overflow");
      if (state === "UNAVAILABLE") {
        state = "READY"; await page.getByRole("button", { name: "Check status", exact: true }).click();
        await page.getByRole("heading", { name: "Computer is ready", exact: true }).waitFor();
        state = "UNAVAILABLE"; await page.reload(); await page.getByRole("heading", { name: title, exact: true }).waitFor();
      }
      await page.screenshot({ path: new URL(`${name}-${next.toLowerCase()}.png`, evidence).pathname, fullPage: true });
      results.push({ viewport: name, state: next, visible: true, overflow: false });
    }
    await context.close();
  }
  await writeFile(new URL("browser-evidence.json", evidence), JSON.stringify({ externalRequestsAllowed: false, results }, null, 2));
  console.log("PASS: desktop/mobile Cold, Preparing, Ready, Failure; check-status recovery; no horizontal overflow.");
} finally { await browser.close(); }
