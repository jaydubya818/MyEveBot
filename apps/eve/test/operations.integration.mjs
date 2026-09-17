import assert from "node:assert/strict";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { getOperationsReport, recordOperationsEvent } from "../lib/operations.ts";

const integration = process.env.DATABASE_URL?.trim() ? test : test.skip;

integration("operations telemetry is persisted and appears in the owner report", async () => {
  const ownerId = `operations_test_${crypto.randomUUID()}`;
  try {
    await recordOperationsEvent({
      ownerId,
      type: "TURN_FAILED",
      sourceType: "eve_session",
      sourceId: `session_${crypto.randomUUID()}`,
      summary: "Synthetic integration failure",
      payload: { code: "integration_failure" },
    });
    await recordOperationsEvent({
      ownerId,
      type: "MODEL_LIMIT_HIT",
      sourceType: "eve_session",
      sourceId: `session_${crypto.randomUUID()}`,
      summary: "Synthetic model limit",
    });
    const report = await getOperationsReport(ownerId);
    assert.equal(report.signals.find((signal) => signal.id === "failed_turns")?.count, 1);
    assert.equal(report.signals.find((signal) => signal.id === "model_limits")?.count, 1);
    assert.equal(report.overall, "warning");
  } finally {
    await db().query(`DELETE FROM eve_events WHERE owner_id=$1`, [ownerId]);
  }
});
