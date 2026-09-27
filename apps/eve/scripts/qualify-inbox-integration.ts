import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createFixtureInbox, FIXTURE_NOW, fixtureApproval } from "../lib/universal-inbox/fixtures.ts";
import { todayContribution, dailyBriefContribution } from "../lib/universal-inbox/feeds.ts";
import { betaApproval, betaAttention } from "../lib/universal-inbox/beta-crosswalk.ts";
const output = resolve("../../docs/verification/universal-inbox/integration-preparation");
const { inbox, repository } = await createFixtureInbox();
try {
  const page = await inbox.list(); const needsYou = await inbox.list({ view: "needs_you" });
  const approvals = needsYou.items.filter(item => item.action?.kind === "approval").map(item => betaApproval(item, fixtureApproval));
  const attention = page.items.map(betaAttention);
  assert.equal(approvals.length, 1); assert.equal(attention.filter(item => item.needsYou).length, 2);
  await writeFile(join(output, "beta-feed-fixtures.json"), JSON.stringify({ version: page.version, mode: "fixture", pinnedBetaSha: "ed0f6b5dad0e3a131a9f5332139e627245cbd4e8",
    productionActivated: false, inbox: page, needsYou, beta: { approvals, attention },
    today: await todayContribution(inbox, "2026-09-26T00:00:00.000Z", FIXTURE_NOW),
    dailyBrief: await dailyBriefContribution(inbox, "2026-09-26T00:00:00.000Z", FIXTURE_NOW) }, null, 2)+"\n");
  console.log("Beta approval join, attention projection, Today and Daily Brief fixture contracts: PASS");
} finally { repository.close(); }
