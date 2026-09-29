import {betaTestPort} from './test-postgres.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { produceLocalResult } from "./local-result.mjs";
const pool = new Pool({
  host: "127.0.0.1",
  port: betaTestPort,
  user: "postgres",
  database: "myeve_beta_phase2",
  max: 12,
});
const checks = [];
try {
  const beta = new BetaIntegration(pool, {
      repository: "qualification/design-partner",
      maxCostUsd: 1,
      maxDurationSeconds: 300,
    }),
    owner = "adversarial-" + randomUUID();
  async function task() {
    const goalId = randomUUID(),
      taskId = randomUUID(),
      service = beta.service(owner, "owner");
    await service.create({
      id: goalId,
      objective: "Verify current evidence",
      criteria: ["Evidence is current"],
    });
    await service.addTask(goalId, {
      id: taskId,
      objective: "Verify current evidence",
      criteria: ["Evidence is current"],
      provenance: {
        kind: "owner",
        reference: "local-adversarial-fixture",
        depth: 0,
      },
    });
    await beta.service(owner).tick(goalId);
    const goal = await beta.queries(owner).goal(goalId);
    return { goalId, taskId, workId: goal.tasks[0].currentWork };
  }
  const first = await task(),
    older = await produceLocalResult(beta, owner, first.workId),
    newer = await produceLocalResult(beta, owner, first.workId);
  assert.equal(
    (await beta.workAdapter().result(owner, first.workId, older.id)).verified,
    false,
  );
  checks.push("older retained Result cannot complete current Work");
  await beta
    .service(owner)
    .receiveResult(first.goalId, first.taskId, first.workId, newer.id);
  assert.equal(
    (await beta.queries(owner).goal(first.goalId)).status,
    "completed",
  );
  await beta
    .store(owner)
    .change(first.workId, { operation: "cancel", expectedVersion: 1 });
  let goal = await beta.queries(owner).goal(first.goalId);
  assert.equal(goal.status, "paused");
  assert.notEqual(goal.tasks[0].status, "completed");
  assert.equal(goal.tasks[0].result, null);
  assert.equal(
    (
      await beta.query(
        "SELECT result FROM goal_work_links WHERE owner_id=$1 AND work_id=$2",
        [owner, first.workId],
      )
    )[0].result.current,
    false,
  );
  assert(goal.tasks[0].history.length);
  checks.push(
    "Work revision invalidates completion and preserves Result history",
  );
  for (let i = 0; i < 8; i++) {
    const t = await task(),
      r = await produceLocalResult(beta, owner, t.workId);
    await Promise.allSettled([
      beta.service(owner).receiveResult(t.goalId, t.taskId, t.workId, r.id),
      beta
        .store(owner)
        .change(t.workId, { operation: "cancel", expectedVersion: 1 }),
    ]);
    const w = await beta.store(owner).get(t.workId);
    if (w.lifecycle !== "cancelled")
      await beta
        .store(owner)
        .change(t.workId, { operation: "cancel", expectedVersion: w.version });
    goal = await beta.queries(owner).goal(t.goalId);
    assert.notEqual(goal.status, "completed");
    assert.notEqual(goal.tasks[0].status, "completed");
  }
  checks.push(
    "eight concurrent Work cancellation versus Result ingestion races have no false completion",
  );
  const replaced = await task(),
    prior = await produceLocalResult(beta, owner, replaced.workId);
  await beta
    .service(owner)
    .receiveResult(replaced.goalId, replaced.taskId, replaced.workId, prior.id);
  assert.equal(
    (await beta.queries(owner).goal(replaced.goalId)).status,
    "completed",
  );
  await produceLocalResult(beta, owner, replaced.workId);
  goal = await beta.queries(owner).goal(replaced.goalId);
  assert.equal(goal.status, "paused");
  assert.notEqual(goal.tasks[0].status, "completed");
  assert.equal(goal.tasks[0].result, null);
  checks.push(
    "new immutable Result invalidates prior completion without deleting history",
  );
  for (let i = 0; i < 8; i++) {
    const t = await task(),
      r = await produceLocalResult(beta, owner, t.workId);
    const results = await Promise.allSettled([
      beta.service(owner).receiveResult(t.goalId, t.taskId, t.workId, r.id),
      produceLocalResult(beta, owner, t.workId),
    ]);
    if (results[1].status === "rejected")
      await produceLocalResult(beta, owner, t.workId);
    goal = await beta.queries(owner).goal(t.goalId);
    assert.notEqual(goal.status, "completed");
    assert.notEqual(goal.tasks[0].status, "completed");
  }
  checks.push(
    "eight concurrent Result supersession versus ingestion races have no false completion",
  );
  await assert.rejects(
    beta.workAdapter().result("foreign-owner", first.workId, newer.id),
  );
  checks.push("foreign Result cannot cross owner boundary");
  const denied = await beta
    .signals()
    .verify({
      ownerId: owner,
      eventId: "forged",
      kind: "owner",
      goalId: first.goalId,
      taskId: first.taskId,
      goalGeneration: 1,
      taskGeneration: 1,
      dependencyId: "fake",
      reference: "fake",
      evidenceRef: "forged",
      option: "Yes",
    });
  assert.equal(denied, false);
  checks.push("unretained owner signals are denied");
  const report = { checks, falseCompletions: 0, crossOwnerDisclosures: 0 };
  await writeFile(
    new URL(
      `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "phase2"}/adversarial.json`,
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
