import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { selectedWorkRecall } from "../../lib/engineering/work-recall-context.ts";
process.env.MYEVE_WORK_RECALL_ENABLED = "true";
const pool = new Pool({
  host: "127.0.0.1",
  port: 55489,
  user: "postgres",
  database: "myeve_beta_phase2",
});
try {
  const beta = new BetaIntegration(pool, {
      repository: "qualification/design-partner",
      maxCostUsd: 1,
      maxDurationSeconds: 300,
    }),
    owner = "recall-replay-" + randomUUID();
  const { work } = await beta
    .store(owner)
    .create({
      title: "Launch deadline",
      objective: "Confirm launch deadline",
      repository: beta.policy.repository,
      criteria: [
        { id: randomUUID(), statement: "Deadline confirmed", method: "test" },
      ],
      maxCostUsd: 1,
      maxDurationSeconds: 300,
      idempotencyKey: randomUUID(),
    });
  const source = randomUUID();
  await beta.query(
    "INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','controlled-local-fixture',$1,'fixture:replay',$3)",
    [source, owner, "sha256:" + "a".repeat(64)],
  );
  const knowledge = new EngineeringKnowledgeStore(beta.store(owner));
  const fact = await knowledge.save({
    workId: work.id,
    sourceId: source,
    statement: "Launch deadline Monday",
    origin: { type: "owner" },
  });
  const first = await selectedWorkRecall(
    beta.store(owner),
    work.id,
    "fixed-step",
  );
  assert(first.content.includes("Monday"));
  await knowledge.save({
    workId: work.id,
    sourceId: source,
    statement: "Launch deadline Friday",
    origin: { type: "owner" },
    supersedesId: fact.id,
  });
  await assert.rejects(
    selectedWorkRecall(beta.store(owner), work.id, "fixed-step"),
    /context changed/,
  );
  const fresh = await selectedWorkRecall(
    beta.store(owner),
    work.id,
    "fresh-step",
  );
  assert(fresh.content.includes("Friday"));
  assert(!fresh.content.includes("Monday"));
  const [saved] = await beta.query(
    "SELECT document FROM beta_work_contexts WHERE owner_id=$1 AND context_ref=$2",
    [owner, first.contextRef],
  );
  assert.equal(
    saved.document.attribution.contentHash,
    first.attribution.contentHash,
  );
  await writeFile(
    new URL(
      `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "phase2"}/recall-replay.json`,
      import.meta.url,
    ),
    JSON.stringify(
      {
        status: "PASS",
        changedStep: "DENIED_BEFORE_PROVIDER",
        originalReceipt: "PRESERVED",
        freshStep: "CURRENT_CORRECTION",
        authorityExpansion: 0,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await pool.end();
}
