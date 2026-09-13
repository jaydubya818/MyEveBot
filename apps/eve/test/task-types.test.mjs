import assert from "node:assert/strict";
import test from "node:test";

import {
  BALANCED_GUARDRAILS,
  PRODUCT_QA_CHECKS,
  QA_SPECIALISTS,
  canTransitionTask,
  redactEvidenceText,
} from "../lib/task-types.ts";

test("Balanced QA contract is fixed and internally complete", () => {
  assert.deepEqual(BALANCED_GUARDRAILS, {
    maxDurationSeconds: 900,
    maxSpecialists: 3,
    maxModelSteps: 40,
    maxRetriesPerSpecialist: 1,
    maxEstimatedCostUsd: 5,
  });
  assert.equal(QA_SPECIALISTS.length, 3);
  assert.equal(new Set(QA_SPECIALISTS.map((item) => item.role)).size, 3);
  assert.equal(PRODUCT_QA_CHECKS.length, 6);
  for (const check of PRODUCT_QA_CHECKS) {
    assert.ok(QA_SPECIALISTS.some((specialist) => specialist.role === check.role));
  }
});

test("task lifecycle accepts only explicit recovery paths", () => {
  assert.equal(canTransitionTask("queued", "running"), true);
  assert.equal(canTransitionTask("running", "awaiting_approval"), true);
  assert.equal(canTransitionTask("awaiting_approval", "running"), true);
  assert.equal(canTransitionTask("running", "completed"), true);
  assert.equal(canTransitionTask("failed", "queued"), true);
  assert.equal(canTransitionTask("completed", "running"), false);
  assert.equal(canTransitionTask("cancelled", "queued"), false);
  assert.equal(canTransitionTask("failed", "completed"), false);
});

test("evidence text removes common secret shapes", () => {
  const redacted = redactEvidenceText(
    "Authorization: Bearer abc123\npassword=secret-value postgres://user:pass@host/db vercel_blob_rw_abcdefghijklmnop",
  );
  assert.doesNotMatch(redacted, /Bearer abc123/);
  assert.doesNotMatch(redacted, /secret-value/);
  assert.doesNotMatch(redacted, /user:pass/);
  assert.doesNotMatch(redacted, /abcdefghijklmnop/);
  assert.match(redacted, /\[REDACTED\]/);
});
