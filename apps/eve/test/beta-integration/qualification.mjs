import { produceLocalResult } from "./local-result.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import {
  loadMigrations,
  runMigrations,
} from "../../scripts/migration-runner.ts";
import {
  digitalWorkContractSchema,
  proofOfWorkSchema,
} from "../../lib/digital-worker/contracts.ts";
import { contractDigest } from "../../lib/goal-work/canonical-adapter.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
import { LearningRuntime } from "../../lib/total-recall/runtime.ts";
import { WorkRecallStore } from "../../lib/total-recall/work-retrieval.ts";
import { assembleSofieRecall } from "../../lib/total-recall/sofie-adapter.ts";
const database = "myeve_beta_qualification";
const admin = new Pool({
  host: "127.0.0.1",
  port: 55489,
  user: "postgres",
  database: "postgres",
});
if (
  !(await admin.query("SELECT FROM pg_database WHERE datname=$1", [database]))
    .rowCount
)
  await admin.query(`CREATE DATABASE ${database}`);
await admin.end();
const pool = new Pool({
  host: "127.0.0.1",
  port: 55489,
  user: "postgres",
  database,
  max: 20,
});
const checks = [];
try {
  const c = await pool.connect();
  const driver = {
    query: async (s, p) => (await c.query(s, p)).rows,
    transaction: async (statements) => {
      await c.query("BEGIN");
      try {
        for (const s of statements) await c.query(s.sql, s.params);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    },
  };
  try {
    await runMigrations(driver, await loadMigrations(), () => {});
    await runMigrations(driver, await loadMigrations(), () => {});
  } finally {
    c.release();
  }
  checks.push("combined migration chain and no-op replay");
  const beta = new BetaIntegration(pool, {
    repository: "qualification/design-partner",
    maxCostUsd: 1,
    maxDurationSeconds: 300,
  });
  const owner = "golden-" + randomUUID(),
    goalId = "goal-" + randomUUID(),
    taskA = "task-" + randomUUID(),
    taskB = "task-" + randomUUID();
  const service = beta.service(owner, "owner"),
    agent = beta.service(owner);
  await service.create({
    id: goalId,
    objective: "Prepare the launch brief",
    criteria: ["Launch brief cites corrected source"],
    priority: "high",
  });
  const plan = await agent.plan(
    goalId,
    "Research then prepare the launch brief",
    "Bounded local qualification",
  );
  await agent.addTask(goalId, {
    id: taskA,
    objective: "Research launch deadline",
    criteria: ["Launch date confirmed"],
    provenance: { kind: "plan", reference: plan.id, depth: 0 },
  });
  await agent.addTask(goalId, {
    id: taskB,
    objective: "Prepare the launch brief",
    criteria: ["Launch brief cites corrected source"],
    dependencies: [
      {
        id: "research",
        kind: "task",
        reference: taskA,
        label: "Research complete",
      },
      {
        id: "choice",
        kind: "owner",
        reference: "launch-channel",
        label: "Choose the launch channel",
        options: ["Email", "Website"],
      },
    ],
    provenance: { kind: "plan", reference: plan.id, depth: 0 },
  });
  await Promise.all(Array.from({ length: 8 }, () => agent.tick(goalId)));
  let goal = await beta.queries(owner).goal(goalId);
  const workA = goal.tasks.find((t) => t.id === taskA).currentWork;
  assert(workA);
  assert.equal(
    (
      await beta.query(
        "SELECT count(*)::int n FROM beta_goal_work_bindings WHERE owner_id=$1 AND binding#>>'{intent,goalId}'=$2",
        [owner, goalId],
      )
    )[0].n,
    1,
  );
  checks.push("concurrent Task to canonical Work creates one intent");
  const source = "source-" + randomUUID();
  await beta.query(
    "INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','local-fixture',$1,'fixture:launch-deadline',$3)",
    [source, owner, "sha256:" + "a".repeat(64)],
  );
  const knowledge = new EngineeringKnowledgeStore(beta.store(owner));
  const initial = await knowledge.save({
    workId: workA,
    statement: "Launch deadline is Monday",
    sourceId: source,
    origin: { type: "owner" },
  });
  const corrected = await knowledge.save({
    workId: workA,
    statement: "Launch deadline is Friday",
    sourceId: source,
    origin: { type: "owner" },
    supersedesId: initial.id,
  });
  const recalled = await beta.recall(
    owner,
    workA,
    "launch deadline",
    "beta:" + randomUUID(),
  );
  assert(recalled.content.includes("Friday"));
  assert(!recalled.content.includes("Monday"));
  assert.equal(recalled.authorityGrants.length, 0);
  checks.push("Work-scoped correction, provenance and bounded recall");

  const resultA = await produceLocalResult(beta, owner, workA);
  await agent.receiveResult(goalId, taskA, workA, resultA.id);
  let page = await beta.inbox(owner).list({});
  const item = page.items.find(
    (i) => i.needsYou && i.action?.prompt === "Choose the launch channel",
  );
  assert(item);
  const response = await beta
    .inbox(owner)
    .respond({
      itemId: item.id,
      actionId: item.action.id,
      actionBinding: item.actionBinding,
      expectedRevision: item.revision,
      idempotencyKey: randomUUID(),
      answer: "Email",
    });
  await Promise.all([beta.deliver(owner), beta.deliver(owner)]);
  const delivered = await beta.responses().read(owner, response.id);
  assert.equal(delivered.status, "DELIVERED");
  goal = await beta.queries(owner).goal(goalId);
  const workB = goal.tasks.find((t) => t.id === taskB).currentWork;
  assert(workB);
  const resultB = await produceLocalResult(beta, owner, workB);
  await agent.receiveResult(goalId, taskB, workB, resultB.id);
  goal = await beta.queries(owner).goal(goalId);
  assert.equal(goal.status, "completed");
  checks.push(
    "Result to Task, owner decision, durable continuation, Goal evidence completion",
  );
  const learning = new LearningStore(beta.store(owner));
  let family = await new LearningRuntime(learning).feedback({
    resultHash: resultB.hash,
    feedback: {
      eventId: randomUUID(),
      workId: workB,
      workVersion: 1,
      workType: "implementation",
      type: "prefer_this",
      target: "result",
      targetRef: resultB.id,
      note: "Cite original sources in the launch brief.",
      behavior: "cite_sources",
      scope: "REPOSITORY",
    },
  });
  for (const action of ["evaluate", "promote"])
    family = await learning.command(family.id, family.revision, {
      eventId: randomUUID(),
      action,
      version: 1,
      hash: family.versions[0].hash,
      reason: "Owner review in local qualification",
    });
  assert.equal(family.versions[0].status, "PROMOTED");
  const { work: later } = await beta
    .store(owner)
    .create({
      title: "Later launch brief",
      objective: "Prepare comparable launch brief",
      repository: "qualification/design-partner",
      criteria: [
        {
          id: randomUUID(),
          statement: "Cite original sources",
          method: "test",
        },
      ],
      maxCostUsd: 1,
      maxDurationSeconds: 300,
      idempotencyKey: randomUUID(),
    });
  const selection = {
    selectedKnowledge: [{ workId: workA, knowledgeId: initial.id }],
    selectedOwnerMemoryIds: [],
  };
  const recall = new WorkRecallStore(beta.store(owner), {
    authorize: async (input) =>
      input.ownerId === owner &&
      input.targetWorkId === later.id &&
      contractDigest(input.selectedKnowledge) ===
        contractDigest(selection.selectedKnowledge) &&
      !input.selectedOwnerMemoryIds.length,
  });
  const laterContext = await assembleSofieRecall(
    recall,
    {
      contractVersion: 1,
      ownerId: owner,
      workId: later.id,
      workVersion: later.version,
      repository: later.repository,
      objective: later.objective,
      projectId: null,
      scope: selection,
      context: {
        query: "launch deadline",
        purpose: "plan",
        workType: "implementation",
        reference: "later:" + randomUUID(),
      },
      limits: { maxItems: 12, maxCharacters: 16000, minRelevance: 0.1 },
    },
    learning,
  );
  assert(laterContext.content.includes("Friday"));
  assert.equal(laterContext.learning.length, 1);
  assert.equal((await beta.queries("another-owner").today()).goals.length, 0);
  assert.equal((await beta.inbox("another-owner").list()).items.length, 0);
  await assert.rejects(() => beta.store("another-owner").get(workA));
  checks.push(
    "Result feedback, evaluation, promotion and selected comparable Work reuse",
  );
  checks.push("cross-owner reads fail closed");
  const interventions = await beta.queries(owner).interventions(goalId);
  const summary = {
    checks,
    owner,
    goalId,
    taskA,
    taskB,
    workA,
    workB,
    laterWork: later.id,
    resultA,
    resultB,
    familyId: family.id,
    correctedKnowledgeId: corrected.id,
    interventions,
    duplicateWork: 0,
    falseCompletions: 0,
    authorityExpansions: 0,
    crossOwnerDisclosures: 0,
    externalProviders: "NOT_RUN",
  };
  await writeFile(
    new URL(
      "../../../../docs/verification/beta-integration/golden.json",
      import.meta.url,
    ),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pool.end();
}
