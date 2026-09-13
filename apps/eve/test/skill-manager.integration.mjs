import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { activeSkillEvalRun, latestSkillEvalRun } from "../agent/lib/skill-manager.ts";
import { db } from "../agent/lib/receipts-db.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());

test("stale skill eval runs fail closed and stop blocking new runs", { skip: !configured }, async () => {
  const ownerId = `test-owner-${randomUUID()}`;
  const runId = `skill_eval_${randomUUID()}`;
  try {
    await db().query(
      `INSERT INTO skill_eval_runs (
         id, owner_id, target, status, mode, requested_count, requested_skills, started_at
       ) VALUES ($1, $2, $3, 'queued', 'changed', 1, '["architect"]'::jsonb, now() - interval '3 hours')`,
      [runId, ownerId, "http://localhost:3000"],
    );

    const latest = await latestSkillEvalRun(ownerId);
    assert.equal(latest?.status, "failed");
    assert.equal(latest?.error, "The eval runner stopped reporting progress.");
    assert.ok(latest?.completedAt);
    assert.equal(await activeSkillEvalRun(ownerId), null);
  } finally {
    if (configured) {
      await db().query("DELETE FROM skill_eval_runs WHERE owner_id = $1", [ownerId]);
    }
  }
});
