import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  pool,
  beta,
  source,
  context,
  configuration,
} from "./activation-fixtures.mjs";
import { CanonicalBetaWork } from "../../lib/beta-integration/canonical-work.ts";
import { NativeRouteAuthority } from "../../lib/engineering/native-routing.ts";
import { DirectDevelopmentStore } from "../../lib/engineering/direct-development.ts";
import { DirectVerificationDriver } from "../../lib/engineering/direct-verification-driver.ts";
import { NativeResultStore } from "../../lib/engineering/native-results.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { digest } from "../../lib/engineering/contract.ts";
const file = new URL(
  "../../../../docs/verification/beta-integration/activation/browser-fixture.json",
  import.meta.url,
);
try {
  const stage = process.argv[2],
    owner = "beta-activation-browser-v2";
  const [goal] = await beta.query(
    "SELECT id FROM goals WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1",
    [owner],
  );
  assert(goal, "Create the Goal through the browser first");
  const snapshot = await beta.queries(owner).goal(goal.id),
    task = snapshot.tasks[0];
  const workId = task.currentWork;
  let work = await beta.store(owner).get(workId);
  if (stage === "prepare") {
    const agentId = "sofie-activation-browser-v2";
    await beta.query(
      "INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Controlled local qualification',true,'active',10,3600,30) ON CONFLICT(id) DO NOTHING",
      [agentId, owner],
    );
    const config = configuration(owner, agentId, work);
    await writeFile(
      process.env.MYEVE_ENGINEERING_CONFIG,
      JSON.stringify(config),
    );
    const sourceId = randomUUID();
    await beta.query(
      "INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','controlled-local-fixture',$1,'fixture:deadline',$3)",
      [sourceId, owner, "sha256:" + "a".repeat(64)],
    );
    const old = await new EngineeringKnowledgeStore(beta.store(owner)).save({
      workId,
      statement: "Launch deadline is Monday",
      sourceId,
      origin: { type: "owner" },
    });
    await new CanonicalBetaWork(beta).requestDecision(
      owner,
      workId,
      "Which source should guide the implementation?",
      ["Use original sources", "Keep paused"],
    );
    await writeFile(
      file,
      JSON.stringify(
        {
          owner,
          workId,
          goalId: goal.id,
          taskId: task.id,
          config,
          oldFactId: old.id,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const fixture = JSON.parse(await readFile(file, "utf8")),
      config = fixture.config;
    if (stage === "context") {
      assert.equal(work.control, "agent");
      const prompt = await context(
        owner,
        work,
        config,
        "browser-current-" + work.generation + "-" + randomUUID(),
      );
      assert(prompt.includes("Friday"));
      assert(!prompt.includes("Monday"));
      fixture.context = "PASS";
    } else if (stage === "result") {
      const authority = new NativeRouteAuthority(
        beta.store(owner),
        async () => config,
      );
      await authority.assertEffect(workId);
      const direct = new DirectDevelopmentStore(beta.store(owner), {
        profile: config.profile,
        approvedBase: config.approvedBase,
        objective: config.objective,
        criteria: config.criteria,
        agentId: config.agentId,
        issueNumber: 1,
        assertCurrentAuthority: (id) => authority.assertEffect(id),
      });
      let workspace = await direct.open(workId, source);
      workspace = await direct.plan(
        workId,
        workspace.revision,
        "Implement the bounded parser with controlled local checks.",
      );
      workspace = await direct.write(
        workId,
        workspace.revision,
        "quantity.mjs",
        "console.log(1);\n",
      );
      await direct.submit(workId, workspace.revision);
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
      await beta
        .service(owner)
        .receiveResult(goal.id, task.id, workId, result.id);
      fixture.result = result;
    } else if (stage === "reuse") {
      const { work: later } = await beta
        .store(owner)
        .create({
          title: "Later comparable Work",
          objective: work.objective,
          repository: work.repository,
          criteria: work.criteria,
          maxCostUsd: 1,
          maxDurationSeconds: 300,
          idempotencyKey: randomUUID(),
        });
      const active = await beta
        .store(owner)
        .change(later.id, {
          operation: "resume",
          expectedVersion: later.version,
        });
      const prompt = await context(
        owner,
        active,
        config,
        "browser-learning-reuse",
      );
      assert(prompt.includes("Include the original source references"));
      assert(!prompt.includes("Friday"));
      fixture.learningReuse = "PASS";
      fixture.laterWork = active.id;
    } else throw Error("Unknown stage");
    await writeFile(file, JSON.stringify(fixture, null, 2) + "\n");
  }
  console.log(
    JSON.stringify({ stage, owner, workId, goalId: goal.id, status: "PASS" }),
  );
} finally {
  await pool.end();
}
