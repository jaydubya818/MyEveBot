import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { ReferenceStore } from "../src/store.ts";
import { Crm } from "../src/crm.ts";
import { startPrototype, fixturePrincipal } from "../prototype/server.mjs";
import { makePackage, verified, OWNER, principal } from "../test/fixtures.mjs";

const require = createRequire(import.meta.url);
const axe = readFileSync(
  require.resolve("axe-core", { paths: [resolve("apps/eve")] }),
  "utf8",
);
const directory = mkdtempSync(join(tmpdir(), "myapps-browser-"));
const store = new ReferenceStore(
  join(directory, "reference.sqlite"),
  () => "2026-10-08T12:00:00.000Z",
);
const pkg = makePackage(),
  row = verified(store, pkg),
  preview = store.createPreview(OWNER, pkg.appId, 1);
const candidates = [
  { ownerId: OWNER, appId: pkg.appId, version: 1, previewId: preview.id },
];
const server = await startPrototype({
  store,
  candidates,
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage(),
  errors = [],
  accessibility = [],
  screenshots = [];
const timings = {},
  visualComparisons = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
const output = resolve("output/playwright/myapps");
mkdirSync(output, { recursive: true });
async function capture(name) {
  await page.evaluate(axe);
  const violations = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.filter((v) => ["critical", "serious"].includes(v.impact)),
  );
  accessibility.push({
    name,
    violations: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  });
  if (violations.length) console.error(JSON.stringify(accessibility.at(-1)));
  assert.deepEqual(
    violations.map((v) => v.id),
    [],
    `accessibility ${name}`,
  );
  const screenshot = await page.screenshot({
    path: join(output, name + ".png"),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  if (process.env.MYAPPS_VISUAL_BASELINE_ROOT) {
    const baseline = readFileSync(
      join(process.env.MYAPPS_VISUAL_BASELINE_ROOT, name + ".png"),
    );
    assert.ok(
      screenshot.equals(baseline),
      `visual regression: ${name}; compare artifacts using the same Chromium/OS/fonts`,
    );
    visualComparisons.push(name);
  }
  screenshots.push(name);
}
const click = async (name) =>
  page.getByRole("button", { name, exact: true }).click();
const waitText = async (value) =>
  page.getByText(value, { exact: true }).waitFor();
try {
  let started = performance.now();
  await page.goto(server.origin);
  timings.documentLoadMs = performance.now() - started;
  await page.getByLabel("Fixture owner").selectOption(OWNER);
  started = performance.now();
  await click("Enter workspace");
  await page.getByRole("heading", { name: "Your Apps" }).waitFor();
  timings.appsNavigationMs = performance.now() - started;
  await capture("apps");
  await click("Preview App");
  await page.getByRole("dialog").waitFor();
  await capture("preview");
  assert.equal(
    store.session(principal()).get(pkg.appId).installedVersion,
    null,
  );
  await click("Review installation");
  await page
    .getByRole("heading", { name: "Install Lead CRM", exact: true })
    .waitFor();
  await capture("needs-you");
  await click("Install App");
  started = performance.now();
  await click("Open Lead CRM");
  await page.getByRole("heading", { name: "Lead CRM", exact: true }).waitFor();
  timings.appLoadMs = performance.now() - started;
  await click("Add lead");
  for (const [label, value] of [
    ["Lead name", "Alex Morgan"],
    ["Company", "Acme"],
    ["Contact information", "alex@example.invalid"],
    ["Source", "Conference"],
    ["Pipeline value ($)", "5000"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await click("Create lead");
  await page
    .getByRole("heading", { name: "Contact and opportunity" })
    .waitFor();
  await page
    .getByLabel("Pipeline stage", { exact: true })
    .selectOption("Qualified");
  await click("Save stage");
  await waitText("Saved. Your App and Sofie now see the same information.");
  await page
    .getByLabel("Add a note", { exact: true })
    .fill("Synthetic follow-up discussion.");
  await click("Add note");
  await page
    .locator(".notes")
    .getByText("Synthetic follow-up discussion.")
    .waitFor();
  await page.getByLabel("Add spend ($)", { exact: true }).fill("150");
  await click("Record spend");
  await waitText("$150 total");
  await page.getByLabel("Next follow-up", { exact: true }).fill("2026-10-08");
  await click("Save follow-up");
  await page.getByLabel("Next follow-up", { exact: true }).waitFor();
  await capture("lead-detail");
  const agent = new Crm(store, fixturePrincipal(OWNER, "agent"));
  let [lead] = agent.query(pkg.appId, 1, row.digest, "listLeads", {});
  assert.equal(lead.stage, "Qualified");
  assert.equal(lead.notes.length, 1);
  assert.equal(lead.spendCents, 15000);
  assert.equal(lead.followup, "2026-10-08");
  await page
    .getByLabel("Your request", { exact: true })
    .fill("Move Acme to Proposal.");
  await click("Ask Sofie");
  await waitText("Acme is now in Proposal.");
  assert.equal(
    await page.getByLabel("Pipeline stage", { exact: true }).inputValue(),
    "Proposal",
  );
  agent.action(
    pkg.appId,
    1,
    row.digest,
    "updateStage",
    {
      leadId: lead.id,
      expectedRevision: lead.revision + 1,
      stage: "Discovery",
    },
    "outside-ui",
  );
  started = performance.now();
  await click("Refresh");
  await page.waitForFunction(
    () => document.querySelector('select[name="stage"]')?.value === "Discovery",
  );
  timings.uiRefreshAfterAgentMs = performance.now() - started;
  await click("Overview");
  await waitText("Open pipeline");
  await capture("overview");
  await click("Pipeline");
  await page.getByRole("region", { name: "Pipeline stages" }).waitFor();
  await capture("pipeline");
  await click("Leads");
  await page.getByLabel("Search leads").fill("Acme");
  await page.getByRole("button", { name: "Acme", exact: true }).waitFor();
  await click("Follow-ups");
  await page.getByRole("heading", { name: "Upcoming and overdue" }).waitFor();
  await capture("followups");
  await click("App details");
  await page.getByRole("heading", { name: "App details" }).waitFor();
  await capture("app-details");
  // Drop an action response after canonical commit, then retry the same form key.
  await click("Leads");
  await click("Acme");
  await page
    .getByLabel("Add a note", { exact: true })
    .fill("Recovered after a lost response.");
  let dropped = false;
  await page.route("**/api/app", async (route) => {
    const body = route.request().postDataJSON();
    if (body.operation === "addNote" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await click("Add note");
  await page.getByRole("alert").waitFor();
  await click("Add note");
  await page
    .locator(".notes")
    .getByText("Recovered after a lost response.")
    .waitFor();
  await page.unroute("**/api/app");
  assert.equal(
    agent.query(pkg.appId, 1, row.digest, "getLead", { leadId: lead.id }).notes
      .length,
    2,
  );
  await click("App details");
  await click("Disable App");
  await page.getByRole("button", { name: "Enable App" }).waitFor();
  await click("Overview");
  await page.getByRole("heading", { name: "This App is disabled" }).waitFor();
  await click("App details");
  await click("Enable App");
  await page.getByRole("button", { name: "Disable App" }).waitFor();
  await click("Overview");
  await waitText("Open pipeline");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("overview-narrow");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.keyboard.press("Tab");
  assert.notEqual(
    await page.evaluate(() => document.activeElement.tagName),
    "BODY",
  );
  await page.reload();
  await click("Enter workspace");
  await click("Open Lead CRM");
  await waitText("Open pipeline");
  assert.equal(
    agent.query(pkg.appId, 1, row.digest, "listLeads", {})[0].notes.length,
    2,
  );
  // Owner changes in one browser must clear grounded messages as well as data.
  await page
    .getByLabel("Your request", { exact: true })
    .fill("Which leads need follow-up?");
  await click("Ask Sofie");
  await waitText("1 lead need follow-up: Acme.");
  const switchOwner = async (owner) => {
    await click("Switch fixture owner");
    await page.getByLabel("Fixture owner").selectOption(owner);
    await click("Enter workspace");
    await page
      .getByRole("heading", {
        name: owner === OWNER ? "Your Apps" : "No Apps installed",
        exact: true,
      })
      .waitFor();
  };
  await switchOwner("synthetic-owner-b");
  assert.ok(!(await page.locator("body").innerText()).includes("Acme"));

  const successor = makePackage(OWNER, 2, { version: 1, digest: row.digest });
  verified(store, successor);
  const updatePreview = store.createPreview(OWNER, pkg.appId, 2);
  candidates.push({
    ownerId: OWNER,
    appId: pkg.appId,
    version: 2,
    previewId: updatePreview.id,
  });
  for (const phase of ["query", "render", "preview"]) {
    await switchOwner(OWNER);
    if (phase === "query") {
      await click("Open Lead CRM");
      await waitText("Open pipeline");
    }
    const entered = Promise.withResolvers(),
      release = Promise.withResolvers(),
      finished = Promise.withResolvers();
    let held = false;
    await page.route("**/api/*", async (route) => {
      const body = route.request().postDataJSON();
      const match =
        phase === "query"
          ? route.request().url().endsWith("/api/agent")
          : body.operation === (phase === "preview" ? "preview" : "listLeads");
      if (!held && match) {
        held = true;
        const response = await route.fetch();
        entered.resolve();
        await release.promise;
        await route.fulfill({ response });
        finished.resolve();
      } else await route.continue();
    });
    try {
      if (phase === "query") {
        await page
          .getByLabel("Your request", { exact: true })
          .fill("Which leads need follow-up?");
        await click("Ask Sofie");
      } else
        await click(phase === "preview" ? "Preview update" : "Open Lead CRM");
      await entered.promise;
      await switchOwner("synthetic-owner-b");
      release.resolve();
      await finished.promise;
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.ok(
        !(await page.locator("body").innerText()).includes("Acme"),
        phase,
      );
      assert.equal(await page.getByRole("dialog").count(), 0, phase);
      assert.equal(await page.getByRole("alert").count(), 0, phase);
      await page
        .getByRole("heading", { name: "No Apps installed", exact: true })
        .waitFor();
    } finally {
      release.resolve();
      await page.unroute("**/api/*");
    }
  }
  // A second browser session must not enumerate, query or inspect another owner's candidate.
  const other = await browser.newContext();
  const foreign = await other.newPage();
  await foreign.goto(server.origin);
  await foreign.getByLabel("Fixture owner").selectOption("synthetic-owner-b");
  await foreign.getByRole("button", { name: "Enter workspace" }).click();
  await foreign.getByRole("heading", { name: "No Apps installed" }).waitFor();
  const denial = await foreign.evaluate(
    async ({ id, hash, previewId }) => {
      const outputs = [];
      for (const body of [
        { appId: id, operation: "detail", version: 1 },
        {
          appId: id,
          operation: "listLeads",
          version: 1,
          digest: hash,
          input: {},
        },
        { appId: id, operation: "preview", previewId },
        {
          appId: id,
          operation: "createLead",
          version: 1,
          digest: hash,
          input: {},
          requestKey: "foreign-attempt",
        },
      ]) {
        const r = await fetch("/api/app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        outputs.push({ status: r.status, body: await r.json() });
      }
      return outputs;
    },
    { id: pkg.appId, hash: row.digest, previewId: preview.id },
  );
  assert.ok(
    denial.every((r) => r.status === 404 && r.body.error === "APP_UNAVAILABLE"),
  );
  for (const origin of [undefined, "https://attacker.invalid"]) {
    const response = await fetch(server.origin + "/api/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: "{}",
    });
    assert.equal(response.status, 404);
  }
  await other.close();
  // A failed first candidate must still offer installation, not update, for v2.
  const retryOwner = "synthetic-owner-b";
  const failed = makePackage(retryOwner);
  const failedRow = store.register("crm-request-1", failed);
  store.recordVerification(retryOwner, failed.appId, 1, {
    format: "myapps.verification.reference.v1",
    appDigest: failedRow.digest,
    candidateId: failed.source.candidateId,
    verifier: "synthetic-independent-verifier",
    status: "FAIL",
    cleanupConfirmed: true,
    claims: [],
  });
  const repaired = makePackage(retryOwner, 2, null);
  verified(store, repaired);
  const retryPreview = store.createPreview(retryOwner, failed.appId, 2);
  candidates.push({
    ownerId: retryOwner,
    appId: failed.appId,
    version: 2,
    previewId: retryPreview.id,
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await click("Apps");
  await click("Preview App");
  await page
    .getByRole("heading", { name: "Preview Lead CRM", exact: true })
    .waitFor();
  await click("Review installation");
  await page
    .getByRole("heading", { name: "Install Lead CRM", exact: true })
    .waitFor();
  await click("Install App");
  await click("Open Lead CRM");
  await waitText("Open pipeline");
  assert.equal(
    store.session(principal(retryOwner)).get(failed.appId).installedVersion,
    2,
  );
  assert.equal(
    store.session(principal(retryOwner)).version(failed.appId, 1).proof.result
      .status,
    "FAIL",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "qualification.json"),
    JSON.stringify(
      {
        status: "PASS",
        screenshots,
        accessibility,
        consoleErrors: errors,
        uiAgentConsistency: "PASS",
        ownerIsolation: "PASS",
        sameBrowserOwnerSwitch: "PASS",
        staleOwnerResponses: ["query", "render", "preview"],
        initialCandidateRecovery: "PASS",
        reconnect: "PASS",
        lostResponseRetry: "PASS",
        visualComparisons,
        browserPerformance: {
          scope: "local synthetic reference; not production SLO",
          ...timings,
        },
        fixtureOnly: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      screenshots: screenshots.length,
      accessibilitySurfaces: accessibility.length,
      output,
    }),
  );
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  writeFileSync(join(output, "failure.html"), await page.content());
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server.close();
  store.close();
  rmSync(directory, { recursive: true });
}
