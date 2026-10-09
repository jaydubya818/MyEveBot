import {betaTestPort} from './test-postgres.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
import { LearningRuntime } from "../../lib/total-recall/runtime.ts";
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
  });
  const owner = "restart-" + randomUUID(),
    goalId = "restart-goal-" + randomUUID(),
    taskA = randomUUID(),
    taskB = randomUUID();
  const service = beta.service(owner, "owner");
  await service.create({
    id: goalId,
    objective: "Restart-safe brief",
    criteria: ["Brief accepted"],
  });
  await service.addTask(goalId, {
    id: taskA,
    objective: "Research",
    criteria: ["Research complete"],
    provenance: { kind: "owner", reference: "local-restart-fixture", depth: 0 },
  });
  function restart(input) {
    const run = (kill) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          new URL("./restart-worker.mjs", import.meta.url).pathname,
          JSON.stringify({ ...input, owner, goalId, kill }),
        ],
        {
          encoding: "utf8",
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        },
      );
    const lost = run(true);
    assert.equal(lost.signal, "SIGKILL", lost.stderr);
    const replay = run(false);
    assert.equal(replay.status, 0, replay.stderr);
    checks.push(input.stage + " commit → SIGKILL → fresh-process replay");
    return JSON.parse(replay.stdout);
  }
  restart({ stage: "memory" });
  assert.equal(
    (
      await beta.query(
        "SELECT count(*)::int n FROM memory_records WHERE owner_id=$1",
        [owner],
      )
    )[0].n,
    1,
  );
  restart({
    stage: "dependency",
    task: {
      id: taskB,
      objective: "Prepare brief",
      criteria: ["Brief accepted"],
      dependencies: [
        { id: "research", kind: "task", reference: taskA, label: "Research" },
        {
          id: "decision",
          kind: "owner",
          reference: "channel",
          label: "Choose channel after restart",
          options: ["Email", "Website"],
        },
      ],
      provenance: {
        kind: "owner",
        reference: "local-restart-fixture",
        depth: 0,
      },
    },
  });
  restart({ stage: "work", taskId: taskA });
  restart({ stage: "inbox" });
  const item = (await beta.inbox(owner).list()).items.find((i) => i.needsYou);
  assert(item);
  const response = {
    itemId: item.id,
    actionId: item.action.id,
    actionBinding: item.actionBinding,
    expectedRevision: item.revision,
    idempotencyKey: randomUUID(),
    answer: "Email",
  };
  restart({ stage: "decision", response });
  restart({ stage: "delivery" });
  let goal = await beta.queries(owner).goal(goalId);
  const workA = goal.tasks.find((t) => t.id === taskA).currentWork;
  const resultA = await produceLocalResult(beta, owner, workA);
  restart({
    stage: "result",
    taskId: taskA,
    workId: workA,
    resultId: resultA.id,
  });
  goal = await beta.queries(owner).goal(goalId);
  const workB = goal.tasks.find((t) => t.id === taskB).currentWork;
  assert(workB);
  const resultB = await produceLocalResult(beta, owner, workB);
  await beta.service(owner).receiveResult(goalId, taskB, workB, resultB.id);
  const store = new LearningStore(beta.store(owner));
  let family = await new LearningRuntime(store).feedback({
    resultHash: resultB.hash,
    feedback: {
      eventId: randomUUID(),
      workId: workB,
      workVersion: 1,
      workType: "implementation",
      type: "prefer_this",
      target: "result",
      targetRef: resultB.id,
      note: "Cite original sources",
      behavior: "cite_sources",
      scope: "REPOSITORY",
    },
  });
  family = await store.command(family.id, family.revision, {
    eventId: randomUUID(),
    action: "evaluate",
    version: 1,
    hash: family.versions[0].hash,
    reason: "Local owner evaluation",
  });
  restart({
    stage: "promotion",
    familyId: family.id,
    revision: family.revision,
    command: {
      eventId: randomUUID(),
      action: "promote",
      version: 1,
      hash: family.versions[0].hash,
      reason: "Owner promotion after review",
    },
  });
  assert.equal(
    (
      await beta.query(
        "SELECT count(*)::int n FROM engineering_work WHERE scope_id=$1",
        [owner],
      )
    )[0].n,
    2,
  );
  assert.equal((await beta.queries(owner).goal(goalId)).status, "completed");
  assert.equal(
    (await store.get(family.id)).events.filter((e) => e.kind === "promote")
      .length,
    1,
  );
  const report = {
    checks,
    duplicateWork: 0,
    falseCompletions: 0,
    interventions: await beta.queries(owner).interventions(goalId),
    source: "Integrated PostgreSQL services; LOCAL_FIXTURE Result producer",
  };
  await writeFile(
    new URL(
      `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "phase2"}/recovery.json`,
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
