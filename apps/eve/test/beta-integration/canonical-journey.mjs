import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { once } from "node:events";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { CanonicalBetaWork } from "../../lib/beta-integration/canonical-work.ts";
import { engineeringConversationModel } from "../../lib/engineering/conversation-model.ts";
import {
  NativeRouteAuthority,
  nativeProfileHash,
  NATIVE_PROVIDER,
} from "../../lib/engineering/native-routing.ts";
import { runtimeSchema } from "../../lib/engineering/runtime.ts";
import { manifestForSnapshot } from "../../lib/engineering/base-preflight.ts";
import { digest, profileSchema } from "../../lib/engineering/contract.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { DirectDevelopmentStore } from "../../lib/engineering/direct-development.ts";
import { DirectVerificationDriver } from "../../lib/engineering/direct-verification-driver.ts";
import { NativeResultStore } from "../../lib/engineering/native-results.ts";
import { LearningRuntime } from "../../lib/total-recall/runtime.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
process.env.MYEVE_WORK_RECALL_ENABLED = "true";
const pool = new Pool({
  host: "127.0.0.1",
  port: 55489,
  user: "postgres",
  database: "myeve_beta_phase2",
  max: 12,
});
const beta = new BetaIntegration(pool, {
  repository: "qualification/design-partner",
  maxCostUsd: 10,
  maxDurationSeconds: 3600,
});
const source = {
  sha: "a".repeat(40),
  files: {
    "README.md": "Controlled local qualification. No live verification.\n",
  },
};
async function context(owner, work, config, session = "context") {
  let prompt,
    schema,
    calls = 0;
  const model = engineeringConversationModel(
    {
      store: beta.store(owner),
      workId: work.id,
      sessionId: session,
      stepKey: session + ":turn:0",
      modelId: "anthropic/claude-sonnet-5",
      productive: true,
    },
    {
      authority: new NativeRouteAuthority(
        beta.store(owner),
        async () => config,
      ),
      catalog: async () => ({
        models: [
          {
            id: "anthropic/claude-sonnet-5",
            pricing: { input: "0.000002", output: "0.00001" },
          },
        ],
      }),
      model: () => ({
        doGenerate: async (options) => {
          calls++;
          prompt = JSON.stringify(options.prompt);
          schema = JSON.stringify(options.tools);
          return {
            content: [
              {
                type: "text",
                text: "Controlled provider: current evidence inspected; admission is separate.",
              },
            ],
            usage: { inputTokens: { total: 100 }, outputTokens: { total: 20 } },
            finishReason: { unified: "stop", raw: "stop" },
            warnings: [],
            providerMetadata: {
              gateway: { cost: "0.003", requestId: "CONTROLLED-LOCAL-FIXTURE" },
            },
          };
        },
      }),
    },
  );
  await model.doGenerate({
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Inspect the selected Work and its launch deadline.",
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        name: "engineering_direct",
        inputSchema: { type: "object" },
      },
    ],
  });
  assert.equal(calls, 1);
  assert(!schema.includes('"write"'));
  assert(schema.includes("admit"));
  return prompt;
}
function configuration(owner, agentId, work) {
  const profile = profileSchema.parse({
    id: "beta-controlled-context",
    version: 1,
    repository: work.repository,
    privateQualification: true,
    baseBranch: "main",
    allowedPaths: ["quantity.mjs"],
    checks: [
      {
        id: "positive",
        program: "quantity.mjs",
        input: "1\n",
        expectedOutput: "1\n",
        expectedExitCode: 0,
        criterionIds: work.criteria.map((c) => c.id),
      },
    ],
    requiredCI: ["quantity-ci"],
    reviewerLogins: ["owner"],
    policyVersion: 1,
    executor: "claude-code",
    image: `node@sha256:${"b".repeat(64)}`,
    maxRuns: 3,
    maxModelRequests: 10,
    maxOutputTokens: 1024,
  });
  const config = runtimeSchema.parse({
    mode: "isolated-dogfood",
    ownerId: owner,
    agentId,
    objective: work.objective,
    criteria: work.criteria,
    profile,
    approvedBase: manifestForSnapshot(source),
    brokerPort: 55470,
    model: "claude-sonnet-5",
  });
  config.nativeQualification = {
    provider: NATIVE_PROVIDER,
    modelId: "anthropic/claude-sonnet-5",
    scopeId: owner,
    profileHash: nativeProfileHash(config),
    evidenceRef: "CONTROLLED-LOCAL-FIXTURE-NOT-LIVE",
    qualifiedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  return config;
}
if (process.argv.includes("--child")) {
  process.once("message", async ({ owner, work, config }) => {
    try {
      const prompt = await context(owner, work, config, "restart-child");
      process.send({ prompt });
    } catch (e) {
      process.send({ error: e.stack });
    }
  });
} else
  try {
    const checks = [],
      owner = "canonical-" + randomUUID(),
      agentId = "sofie-" + randomUUID(),
      goalId = randomUUID(),
      taskId = randomUUID();
    await beta.query(
      `INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Controlled local qualification',true,'active',10,3600,30)`,
      [agentId, owner],
    );
    const service = beta.service(owner),
      ownerService = beta.service(owner, "owner");
    await ownerService.create({
      id: goalId,
      objective: "Implement launch deadline parser",
      criteria: ["Launch deadline parser is independently checked"],
      priority: "high",
    });
    const plan = await service.plan(
      goalId,
      "Bounded local implementation",
      "Controlled qualification",
    );
    await service.addTask(goalId, {
      id: taskId,
      objective: "Implement launch deadline parser",
      criteria: ["Launch deadline parser is independently checked"],
      provenance: { kind: "plan", reference: plan.id, depth: 0 },
    });
    await Promise.all(Array.from({ length: 8 }, () => service.tick(goalId)));
    const goal = await beta.queries(owner).goal(goalId),
      workId = goal.tasks[0].currentWork;
    let work = await beta.store(owner).get(workId);
    assert.equal(work.control, "paused");
    assert.equal(
      (
        await beta.query(
          "SELECT count(*)::int n FROM beta_goal_work_bindings WHERE owner_id=$1",
          [owner],
        )
      )[0].n,
      1,
    );
    const disabled = new CanonicalBetaWork(beta);
    assert.equal(
      (await disabled.admit(owner, workId, work.version, work.generation))
        .status,
      "DENIED",
    );
    checks.push(
      "Goal creates one paused Work; absent qualification denies admission without dispatch",
    );
    work = await beta
      .store(owner)
      .change(workId, { operation: "resume", expectedVersion: work.version });
    const config = configuration(owner, agentId, work),
      authority = new NativeRouteAuthority(
        beta.store(owner),
        async () => config,
      ),
      canonical = new CanonicalBetaWork(beta, () => authority);
    assert.equal(
      (await canonical.admit(owner, workId, work.version, work.generation))
        .status,
      "DENIED",
    );
    const sourceId = randomUUID();
    await beta.query(
      "INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','controlled-local-fixture',$1,'fixture:launch-deadline',$3)",
      [sourceId, owner, "sha256:" + "a".repeat(64)],
    );
    const knowledge = new EngineeringKnowledgeStore(beta.store(owner));
    const old = await knowledge.save({
      workId,
      statement: "Launch deadline is Monday",
      sourceId,
      origin: { type: "owner" },
    });
    await knowledge.save({
      workId,
      statement: "Launch deadline is Friday",
      sourceId,
      origin: { type: "owner" },
      supersedesId: old.id,
    });
    const { work: foreign } = await beta
      .store(owner)
      .create({
        title: "Private separate Work",
        objective: "Private separate launch deadline",
        repository: work.repository,
        criteria: work.criteria,
        maxCostUsd: 1,
        maxDurationSeconds: 300,
        idempotencyKey: randomUUID(),
      });
    const privateSource = randomUUID();
    await beta.query(
      "INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','controlled-local-fixture',$1,'fixture:private',$3)",
      [privateSource, owner, "sha256:" + "b".repeat(64)],
    );
    await knowledge.save({
      workId: foreign.id,
      statement: "Launch deadline private secret is Sunday",
      sourceId: privateSource,
      origin: { type: "owner" },
    });
    const prompt = await context(owner, work, config);
    assert(prompt.includes("Friday"));
    assert(!prompt.includes("Monday"));
    assert(!prompt.includes("Sunday"));
    const retainedContext = (
      await beta.query(
        "SELECT document FROM beta_work_contexts WHERE owner_id=$1 AND work_id=$2",
        [owner, workId],
      )
    )[0].document;
    assert.deepEqual(retainedContext.authorityGrants, []);
    assert(retainedContext.content.length <= 6000);
    checks.push(
      "Actual canonical model wrapper receives bounded current Recall; superseded and other Work evidence excluded; tools unchanged",
    );
    const admission = await canonical.admit(
      owner,
      workId,
      work.version,
      work.generation,
    );
    assert.equal(admission.status, "ADMITTED", admission.reason);
    await assert.rejects(() =>
      canonical.admit("foreign-owner", workId, work.version, work.generation),
    );
    await assert.rejects(() =>
      canonical.admit(owner, workId, work.version - 1, work.generation),
    );
    checks.push(
      "Canonical admission requires retained current conversation, exact owner/version/generation and all canonical policy gates",
    );
    const direct = new DirectDevelopmentStore(beta.store(owner), {
      profile: config.profile,
      approvedBase: config.approvedBase,
      objective: config.objective,
      criteria: config.criteria,
      agentId,
      issueNumber: 1,
      assertCurrentAuthority: (id) => authority.assertEffect(id),
    });
    let workspace = await direct.open(workId, source);
    workspace = await direct.plan(
      workId,
      workspace.revision,
      "Implement the parser and submit for controlled independent local checks.",
    );
    workspace = await direct.write(
      workId,
      workspace.revision,
      "quantity.mjs",
      "console.log(1);\n",
    );
    const submitted = await direct.submit(workId, workspace.revision);
    await assert.rejects(
      () => new NativeResultStore(direct).retain(workId),
      /independently checked/,
    );
    const verifier = {
      verify: async (contract, candidate) =>
        config.profile.checks.map((check) => {
          const artifact = {
            stdout: "1\n",
            stderr: "",
            exitCode: 0,
            qualification: "CONTROLLED_LOCAL_FIXTURE_NOT_LIVE",
          };
          return {
            workId,
            candidate: candidate.sha,
            base: source.sha,
            criteriaVersion: work.criteriaVersion,
            profileHash: digest(config.profile),
            environment: config.profile.image,
            attemptId: candidate.attemptId,
            producer: "protected-supervisor",
            check: check.id,
            result: "PASS",
            artifact,
            artifactHash: digest(artifact),
            observedAt: new Date().toISOString(),
          };
        }),
    };
    await new DirectVerificationDriver(direct, verifier).run(workId);
    const result = await new NativeResultStore(direct).retain(workId);
    assert.equal(result.proof.outcome, "PARTIAL");
    assert.equal(result.proof.resultRevision, submitted.candidate.sha);
    await service.receiveResult(goalId, taskId, workId, result.id);
    const after = await beta.queries(owner).goal(goalId);
    assert.notEqual(after.status, "completed");
    assert.notEqual(after.tasks[0].status, "completed");
    assert.equal(
      (await canonical.projection(owner, workId)).projection.readiness.ready,
      false,
    );
    assert.equal(
      (await new NativeResultStore(direct).retain(workId)).id,
      result.id,
    );
    checks.push(
      "Canonical immutable Result binds candidate/evidence; local PASS remains PARTIAL and cannot complete Task/Goal or claim Ready",
    );
    const learning = new LearningStore(beta.store(owner));
    let family = await new LearningRuntime(learning).feedback({
      resultHash: result.contentHash,
      feedback: {
        eventId: randomUUID(),
        workId,
        workVersion: work.version,
        workType: "implementation",
        type: "prefer_this",
        target: "result",
        targetRef: result.id,
        note: "Cite original sources for the launch deadline.",
        behavior: "cite_sources",
        scope: "REPOSITORY",
      },
    });
    assert.notEqual(family.versions[0].status, "PROMOTED");
    for (const action of ["evaluate", "promote"])
      family = await learning.command(family.id, family.revision, {
        eventId: randomUUID(),
        action,
        version: 1,
        hash: family.versions[0].hash,
        reason: "Explicit owner review in controlled qualification",
      });
    assert.equal(family.versions[0].status, "PROMOTED");
    let { work: later } = await beta
      .store(owner)
      .create({
        title: "Later launch deadline parser",
        objective: work.objective,
        repository: work.repository,
        criteria: work.criteria,
        maxCostUsd: 10,
        maxDurationSeconds: 3600,
        idempotencyKey: randomUUID(),
      });
    later = await beta
      .store(owner)
      .change(later.id, {
        operation: "resume",
        expectedVersion: later.version,
      });
    const child = fork(new URL(import.meta.url), ["--child"], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const childReply = Promise.race([
      once(child, "message"),
      once(child, "exit").then(() => {
        throw Error(stderr || "Child exited early");
      }),
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(Error("Child timeout " + stderr)),
          30000,
        );
        t.unref();
      }),
    ]);
    child.send({ owner, work: later, config });
    const [reply] = await childReply;
    assert(!reply.error, reply.error);
    assert(reply.prompt.includes("Include the original source references"));
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    assert.equal((await exited)[1], "SIGKILL");
    const afterRestart = await context(owner, later, config, "after-restart");
    assert(afterRestart.includes("Include the original source references"));
    assert(!afterRestart.includes("Friday"));
    checks.push(
      "Result feedback stays candidate until evaluation/promotion; fresh process consumes repository learning; SIGKILL then fresh model context preserves learning and Work scope",
    );
    const decision = await canonical.requestDecision(
      owner,
      foreign.id,
      "Choose the controlled continuation",
      ["Continue", "Wait"],
    );
    const item = (await beta.inbox(owner).list()).items.find(
      (i) => i.workId === foreign.id && i.needsYou,
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
        answer: "Continue",
      });
    const beforeControl = await beta.store(owner).get(foreign.id);
    const receipts = await Promise.all([
      canonical.accept(response),
      canonical.accept(response),
    ]);
    assert(receipts.every((r) => r.status === "accepted"));
    assert.deepEqual(await beta.store(owner).get(foreign.id), beforeControl);
    assert.equal(
      (
        await beta.query(
          "SELECT count(*)::int n FROM beta_work_continuations WHERE owner_id=$1 AND work_id=$2",
          [owner, foreign.id],
        )
      )[0].n,
      1,
    );
    assert.equal(
      (
        await beta.query(
          "SELECT count(*)::int n FROM engineering_routing_decisions WHERE scope_id=$1 AND work_id=$2 AND status='ADMITTED'",
          [owner, foreign.id],
        )
      )[0].n,
      0,
    );
    let blocked = await beta
      .store(owner)
      .change(later.id, { operation: "pause", expectedVersion: later.version });
    await canonical.requestDecision(
      owner,
      later.id,
      "Choose after the current generation",
      ["Continue", "Wait"],
    );
    const staleItem = (await beta.inbox(owner).list()).items.find(
      (i) => i.workId === later.id && i.needsYou,
    );
    const staleResponse = await beta
      .inbox(owner)
      .respond({
        itemId: staleItem.id,
        actionId: staleItem.action.id,
        actionBinding: staleItem.actionBinding,
        expectedRevision: staleItem.revision,
        idempotencyKey: randomUUID(),
        answer: "Continue",
      });
    await beta
      .store(owner)
      .change(later.id, {
        operation: "resume",
        expectedVersion: blocked.version,
      });
    assert.equal((await canonical.accept(staleResponse)).status, "stale");
    checks.push(
      "Unmounted canonical continuation consumer deduplicates retained responses, rejects stale generation, and records eligibility without changing Work control or granting admission",
    );
    const summary = {
      qualification: "CONTROLLED_LOCAL_FIXTURE",
      productionContextPath: "PASS",
      liveModel: "NOT_RUN",
      protectedLiveVerification: "NOT_RUN",
      canonicalResult: "PARTIAL",
      goldenJourney: "PARTIAL",
      limitation:
        "Canonical local Result does not establish publication, CI, review or acceptance. Task/Goal completion is intentionally withheld. UI/continuation mounting remains separately qualified.",
      owner,
      agentId,
      goalId,
      taskId,
      workId,
      laterWork: later.id,
      result,
      checks,
      duplicateWork: 0,
      falseTaskCompletion: 0,
      falseGoalCompletion: 0,
      authorityExpansion: 0,
      crossOwnerDisclosure: 0,
      falseReady: 0,
      config,
    };
    await writeFile(
      new URL(
        "../../../../docs/verification/beta-integration/phase2/canonical-journey.json",
        import.meta.url,
      ),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
