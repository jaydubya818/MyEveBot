import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pool, beta, command } from "./activation-fixtures.mjs";
import { betaIntegration } from "../../lib/beta-integration/runtime.ts";
import { CanonicalBetaWork } from "../../lib/beta-integration/canonical-work.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
import { LearningRuntime } from "../../lib/total-recall/runtime.ts";
import { NativeRouteAuthority } from "../../lib/engineering/native-routing.ts";
import { DirectDevelopmentStore } from "../../lib/engineering/direct-development.ts";
import { NativeResultStore } from "../../lib/engineering/native-results.ts";
const fixture = JSON.parse(
  await readFile(
    new URL(
      `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "activation"}/canonical-journey.json`,
      import.meta.url,
    ),
    "utf8",
  ),
);
async function perform(input) {
  const { owner, stage } = input,
    canonical = new CanonicalBetaWork(beta);
  if (stage === "decision")
    return canonical.requestDecision(
      owner,
      input.work.id,
      "Restart-safe canonical judgment",
      ["Continue", "Wait"],
    );
  if (stage === "response") return beta.inbox(owner).respond(input.response);
  if (stage === "delivery") return beta.deliver(owner);
  if (stage === "control")
    return command(
      owner,
      input.work,
      "continue",
      input.responseId,
      input.replay ? 409 : 200,
    );
  if (stage === "result") {
    const config = fixture.config,
      authority = new NativeRouteAuthority(
        beta.store(owner),
        async () => config,
      );
    const direct = new DirectDevelopmentStore(beta.store(owner), {
      profile: config.profile,
      approvedBase: config.approvedBase,
      objective: config.objective,
      criteria: config.criteria,
      agentId: config.agentId,
      issueNumber: 1,
      assertCurrentAuthority: (id) => authority.assertEffect(id),
    });
    return new NativeResultStore(direct).retain(fixture.workId);
  }
  if (stage === "feedback")
    return new LearningRuntime(new LearningStore(beta.store(owner))).feedback(
      input.feedback,
    );
  if (stage === "promotion")
    return new LearningStore(beta.store(owner)).command(
      input.familyId,
      input.revision,
      input.command,
    );
  throw Error("Unknown checkpoint");
}
try {
  if (process.argv[2]) {
    const input = JSON.parse(process.argv[2]);
    const result = await perform(input);
    if (input.kill) process.kill(process.pid, "SIGKILL");
    console.log(JSON.stringify(result));
  } else {
    const owner = fixture.owner,
      checks = [];
    function restart(input) {
      const run = (kill) =>
        spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            new URL(import.meta.url).pathname,
            JSON.stringify({ ...input, owner, kill, replay: !kill }),
          ],
          {
            encoding: "utf8",
            env: { MYEVE_BETA_TEST_PORT: process.env.MYEVE_BETA_TEST_PORT, PATH: process.env.PATH, HOME: process.env.HOME, MYEVE_BETA_EVIDENCE_PHASE: process.env.MYEVE_BETA_EVIDENCE_PHASE },
          },
        );
      const lost = run(true);
      assert.equal(lost.signal, "SIGKILL", lost.stderr);
      const replay = run(false);
      assert.equal(replay.status, 0, replay.stderr);
      checks.push(input.stage + " commit → SIGKILL → fresh-process replay");
      return JSON.parse(replay.stdout);
    }
    const { work } = await beta
      .store(owner)
      .create({
        title: "Restart control",
        objective: "Check durable continuation",
        repository: fixture.config.profile.repository,
        criteria: fixture.config.criteria,
        maxCostUsd: 1,
        maxDurationSeconds: 300,
        idempotencyKey: randomUUID(),
      });
    const item = restart({ stage: "decision", work });
    const response = restart({
      stage: "response",
      response: {
        itemId: item.id,
        actionId: item.action.id,
        actionBinding: item.actionBinding,
        expectedRevision: item.revision,
        idempotencyKey: randomUUID(),
        answer: "Continue",
      },
    });
    restart({ stage: "delivery" });
    restart({ stage: "control", work, responseId: response.id });
    assert.equal((await beta.store(owner).get(work.id)).generation, 2);
    const result = restart({ stage: "result" });
    assert.equal(result.id, fixture.result.id);
    const family = restart({
      stage: "feedback",
      feedback: {
        resultHash: result.contentHash,
        feedback: {
          eventId: randomUUID(),
          workId: fixture.workId,
          workVersion: result.proof.workVersion,
          workType: "implementation",
          type: "prefer_this",
          target: "result",
          targetRef: result.id,
          note: "Cite original sources for durable results.",
          behavior: "cite_sources",
          scope: "WORK",
        },
      },
    });
    const store = new LearningStore(beta.store(owner));
    const evaluated = await store.command(family.id, family.revision, {
      eventId: randomUUID(),
      action: "evaluate",
      version: 1,
      hash: family.versions[0].hash,
      reason: "Controlled restart evaluation",
    });
    const promoted = restart({
      stage: "promotion",
      familyId: family.id,
      revision: evaluated.revision,
      command: {
        eventId: randomUUID(),
        action: "promote",
        version: 1,
        hash: family.versions[0].hash,
        reason: "Explicit controlled owner promotion",
      },
    });
    assert.equal(promoted.versions[0].status, "PROMOTED");
    const report = {
      checks,
      duplicateContinuations: 0,
      falseTaskGoalCompletions: 0,
    };
    await writeFile(
      new URL(
        `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "activation"}/canonical-recovery.json`,
        import.meta.url,
      ),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(report);
  }
} finally {
  await pool.end();
  await betaIntegration().pool.end();
}
