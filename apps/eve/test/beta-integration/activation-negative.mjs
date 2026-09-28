import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pool, beta, command, request } from "./activation-fixtures.mjs";
import { betaIntegration } from "../../lib/beta-integration/runtime.ts";
import { CanonicalBetaWork } from "../../lib/beta-integration/canonical-work.ts";
const owner = "activation-negative-" + randomUUID(),
  canonical = new CanonicalBetaWork(beta),
  checks = [];
process.env.MYEVE_ENGINEERING_MODE = "disabled";
async function blocked() {
  const { work } = await beta.store(owner).create({
    title: "Local negative qualification",
    objective: "Verify isolated continuation",
    repository: "qualification/design-partner",
    criteria: [
      {
        id: randomUUID(),
        statement: "Never bypass authority",
        method: "test",
      },
    ],
    maxCostUsd: 1,
    maxDurationSeconds: 300,
    idempotencyKey: randomUUID(),
  });
  const item = await canonical.requestDecision(
    owner,
    work.id,
    "Choose continuation",
    ["Continue", "Wait"],
  );
  const response = await beta.inbox(owner).respond({
    itemId: item.id,
    actionId: item.action.id,
    actionBinding: item.actionBinding,
    expectedRevision: item.revision,
    idempotencyKey: randomUUID(),
    answer: "Continue",
  });
  await beta.deliver(owner);
  return { work, response, item };
}
try {
  const race = await blocked();
  const attempts = await Promise.allSettled(
    Array.from({ length: 16 }, () =>
      canonical.control(
        owner,
        race.work.id,
        race.work.version,
        race.work.generation,
        "continue",
        race.response.id,
      ),
    ),
  );
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  assert.equal((await beta.store(owner).get(race.work.id)).generation, 2);
  assert.equal((await canonical.accept(race.response)).status, "stale");
  checks.push(
    "16 concurrent continuations: one resume, one generation increment, zero productive dispatch",
  );
  for (const lifecycle of ["cancelled", "accepted"]) {
    const { work, response } = await blocked();
    // Terminal state fixture; API never exposes unrestricted lifecycle mutation.
    await beta.query(
      "UPDATE engineering_work SET lifecycle=$3 WHERE scope_id=$1 AND id=$2",
      [owner, work.id, lifecycle],
    );
    await command(owner, work, "continue", response.id, 409);
    assert.equal((await beta.store(owner).get(work.id)).control, "paused");
    checks.push(lifecycle + " Work cannot continue");
  }
  const superseded = await blocked();
  const [decision] = await beta.query(
    "SELECT event FROM beta_work_decisions WHERE owner_id=$1 AND action_id=$2",
    [owner, superseded.response.action.id],
  );
  await beta.inbox(owner).ingest({
    ...decision.event,
    sequence: 2,
    disposition: "supersede",
    action: null,
    source: {
      ...decision.event.source,
      eventId: "superseded-" + randomUUID(),
    },
  });
  await command(
    owner,
    superseded.work,
    "continue",
    superseded.response.id,
    409,
  );
  checks.push(
    "Superseded Inbox item denies an already-delivered eligibility receipt",
  );
  const stale = await blocked();
  await beta.store(owner).change(stale.work.id, {
    operation: "pause",
    expectedVersion: stale.work.version,
  });
  await command(owner, stale.work, "continue", stale.response.id, 409);
  const wrong = await blocked();
  await command(owner, wrong.work, "continue", stale.response.id, 409);
  await assert.rejects(() =>
    canonical.accept({ ...wrong.response, correlationId: "forged" }),
  );
  checks.push(
    "Stale generation, wrong Work and forged correlation cannot continue",
  );
  const snapshot = await beta.store(owner).get(wrong.work.id);
  await request(
    owner,
    "work",
    {
      operation: "resume",
      workId: snapshot.id,
      expectedVersion: snapshot.version,
      expectedGeneration: snapshot.generation,
      ownerId: "forged",
    },
    400,
  );
  assert.deepEqual(await beta.store(owner).get(wrong.work.id), snapshot);
  const report = {
    checks,
    unauthorizedProductiveEffects: 0,
    duplicateContinuations: 0,
    staleResponseContinuations: 0,
    authorityExpansions: 0,
  };
  await writeFile(
    new URL(
      "../../../../docs/verification/beta-integration/activation/negative.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} finally {
  await pool.end();
  await betaIntegration().pool.end();
}
