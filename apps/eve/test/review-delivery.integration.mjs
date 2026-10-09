import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import {
  claimDueReviewDeliveries,
  enqueueDueReviewDeliveries,
  failReviewDelivery,
  getReviewDeliveryPreferences,
  listReviewDeliveries,
  updateReviewDeliveryPreferences,
} from "../lib/review-delivery-db.ts";
import { generateProgressReviewCheckpoint } from "../lib/reviews.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());

test("review delivery preferences schedule durably and deduplicate a period", { skip: !configured }, async () => {
  const ownerId = `delivery-owner-${randomUUID()}`;
  const now = new Date("2026-09-13T15:00:00.000Z");
  try {
    const defaults = await getReviewDeliveryPreferences(ownerId);
    assert.equal(defaults.dailyBriefEnabled, false);
    assert.equal(defaults.preferredDeliveryChannel, "in_app");

    const updated = await updateReviewDeliveryPreferences(ownerId, {
      ownerTimezone: "America/Los_Angeles",
      dailyBriefEnabled: true,
      dailyBriefTime: "08:00",
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    }, now);
    assert.equal(updated.dailyNextAt, "2026-09-14T15:00:00.000Z");

    await db().query(
      "UPDATE review_delivery_preferences SET daily_next_at = $1 WHERE owner_id = $2",
      [now.toISOString(), ownerId],
    );
    assert.equal(await enqueueDueReviewDeliveries(now), 1);
    await db().query(
      "UPDATE review_delivery_preferences SET daily_next_at = $1 WHERE owner_id = $2",
      [now.toISOString(), ownerId],
    );
    assert.equal(await enqueueDueReviewDeliveries(now), 1);

    const deliveries = await listReviewDeliveries(ownerId);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].deduplicationHits, 1);
    const claimed = await claimDueReviewDeliveries(now);
    const delivery = claimed.find((item) => item.ownerId === ownerId);
    assert.ok(delivery);
    await failReviewDelivery(delivery, {
      category: "transient",
      code: "test_timeout",
      summary: "Temporary test failure.",
    }, now);
    const retryAt = new Date(now.getTime() + 60_000);
    const retried = (await claimDueReviewDeliveries(retryAt)).find((item) => item.ownerId === ownerId);
    assert.equal(retried?.attemptCount, 2);
    assert.ok(retried);
    await failReviewDelivery(retried, {
      category: "transient",
      code: "test_timeout_again",
      summary: "Second temporary test failure.",
    }, retryAt);
    const finalRetryAt = new Date(retryAt.getTime() + 5 * 60_000);
    const finalRetry = (await claimDueReviewDeliveries(finalRetryAt)).find((item) => item.ownerId === ownerId);
    assert.equal(finalRetry?.attemptCount, 3);
    assert.ok(finalRetry);
    await failReviewDelivery(finalRetry, {
      category: "transient",
      code: "test_timeout_final",
      summary: "Final temporary test failure.",
    }, finalRetryAt);
    assert.equal(
      (await claimDueReviewDeliveries(new Date(finalRetryAt.getTime() + 60 * 60_000)))
        .some((item) => item.ownerId === ownerId),
      false,
    );
    const attemptRows = await db().query(
      `SELECT attempt_number, status FROM review_delivery_attempts
       WHERE delivery_id = $1 ORDER BY attempt_number`,
      [delivery.id],
    );
    assert.deepEqual(attemptRows.map((row) => [Number(row.attempt_number), row.status]), [
      [1, "failed"],
      [2, "failed"],
      [3, "failed"],
    ]);

    const firstCheckpoint = await generateProgressReviewCheckpoint(ownerId, "daily", {
      timezone: "America/Los_Angeles",
      periodAt: now,
      now,
      reuse: true,
    });
    const reusedCheckpoint = await generateProgressReviewCheckpoint(ownerId, "daily", {
      timezone: "America/Los_Angeles",
      periodAt: now,
      now,
      reuse: true,
    });
    assert.equal(firstCheckpoint.reused, false);
    assert.equal(reusedCheckpoint.reused, true);
    assert.equal(reusedCheckpoint.checkpoint.id, firstCheckpoint.checkpoint.id);

    await updateReviewDeliveryPreferences(ownerId, {
      weeklyReviewEnabled: true,
      weeklyReviewDay: 0,
      weeklyReviewTime: "08:00",
    }, now);
    await db().query(
      "UPDATE review_delivery_preferences SET weekly_next_at = $1 WHERE owner_id = $2",
      [now.toISOString(), ownerId],
    );
    await enqueueDueReviewDeliveries(now);
    assert.equal((await listReviewDeliveries(ownerId)).some((item) => item.reviewKind === "weekly"), true);
    const weekly = (await claimDueReviewDeliveries(now)).find(
      (item) => item.ownerId === ownerId && item.reviewKind === "weekly",
    );
    assert.ok(weekly);
    await db().query(
      "UPDATE review_deliveries SET claimed_until = $1 WHERE id = $2",
      [new Date(now.getTime() - 1_000).toISOString(), weekly.id],
    );
    const reclaimedAt = new Date(now.getTime() + 6 * 60_000);
    const reclaimedWeekly = (await claimDueReviewDeliveries(reclaimedAt)).find(
      (item) => item.ownerId === ownerId && item.reviewKind === "weekly",
    );
    assert.equal(reclaimedWeekly?.attemptCount, 2);
    assert.ok(reclaimedWeekly);
    const expiredAttemptRows = await db().query(
      `SELECT status, failure_code FROM review_delivery_attempts
       WHERE delivery_id = $1 AND attempt_number = 1`,
      [weekly.id],
    );
    assert.deepEqual(expiredAttemptRows[0], {
      status: "failed",
      failure_code: "delivery_lease_expired",
    });
    await failReviewDelivery(reclaimedWeekly, {
      category: "authorization",
      code: "test_denied",
      summary: "Permanent authorization failure.",
    }, reclaimedAt);
    assert.equal(
      (await claimDueReviewDeliveries(new Date(now.getTime() + 24 * 60 * 60_000)))
        .some((item) => item.ownerId === ownerId),
      false,
    );
  } finally {
    if (configured) {
      await db().query("DELETE FROM review_deliveries WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM review_delivery_preferences WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM review_checkpoints WHERE owner_id = $1", [ownerId]);
      await db().query("DELETE FROM eve_events WHERE owner_id = $1", [ownerId]);
    }
  }
});
