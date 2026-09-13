import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { buildDailyBrief, buildWeeklyReview } from "./goal-insights.ts";
import { listGoalDetails } from "./goals.ts";
import { listOutcomes } from "./outcomes.ts";
import type { ReviewCheckpoint } from "./review-schedule-types.ts";
import { reviewPeriod } from "./review-time.ts";
import type { ProgressReview, ReviewKind } from "./review-types.ts";

type Row = Record<string, unknown>;

function isoText(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Review checkpoint timestamp is invalid.");
  return date.toISOString();
}

function checkpointFrom(row: Row): ReviewCheckpoint | null {
  if (typeof row.review_snapshot !== "object" || row.review_snapshot === null) return null;
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    kind: String(row.review_kind) as ReviewKind,
    localPeriodKey: String(row.local_period_key),
    timezone: String(row.timezone),
    periodStart: isoText(row.period_start),
    periodEnd: isoText(row.period_end),
    generatedAt: isoText(row.last_generated_at),
    review: row.review_snapshot as ProgressReview,
  };
}

export async function getReviewCheckpoint(
  ownerId: string,
  kind: ReviewKind,
  localPeriodKey: string,
): Promise<ReviewCheckpoint | null> {
  const rows = await db().query(
    `SELECT id, owner_id, review_kind, local_period_key, timezone,
       period_start::text, period_end::text, last_generated_at::text, review_snapshot
     FROM review_checkpoints
     WHERE owner_id = $1 AND review_kind = $2 AND local_period_key = $3
     LIMIT 1`,
    [ownerId, kind, localPeriodKey],
  ) as Row[];
  return rows[0] ? checkpointFrom(rows[0]) : null;
}

export async function getLatestReviewCheckpoint(
  ownerId: string,
  kind: ReviewKind,
): Promise<ReviewCheckpoint | null> {
  const rows = await db().query(
    `SELECT id, owner_id, review_kind, local_period_key, timezone,
       period_start::text, period_end::text, last_generated_at::text, review_snapshot
     FROM review_checkpoints
     WHERE owner_id = $1 AND review_kind = $2 AND review_snapshot IS NOT NULL
     ORDER BY last_generated_at DESC LIMIT 1`,
    [ownerId, kind],
  ) as Row[];
  return rows[0] ? checkpointFrom(rows[0]) : null;
}

async function computeProgressReview(
  ownerId: string,
  kind: ReviewKind,
  timezone: string,
  now: Date,
  periodAt: Date,
): Promise<{ review: ProgressReview; localPeriodKey: string }> {
  const period = reviewPeriod(kind, timezone, periodAt);
  const goals = await listGoalDetails(ownerId, { limit: 200 });
  const review = kind === "daily"
    ? buildDailyBrief(goals, now, period)
    : buildWeeklyReview(goals, await listOutcomes(ownerId, 200), now, period);
  return { review, localPeriodKey: period.key };
}

export async function generateProgressReviewCheckpoint(
  ownerId: string,
  kind: ReviewKind,
  options: { timezone?: string; now?: Date; periodAt?: Date; reuse?: boolean } = {},
): Promise<{ checkpoint: ReviewCheckpoint; reused: boolean }> {
  const now = options.now ?? new Date();
  const periodAt = options.periodAt ?? now;
  const timezone = options.timezone ?? "UTC";
  const period = reviewPeriod(kind, timezone, periodAt);
  if (options.reuse) {
    const existing = await getReviewCheckpoint(ownerId, kind, period.key);
    if (existing !== null) return { checkpoint: existing, reused: true };
  }
  const { review, localPeriodKey } = await computeProgressReview(ownerId, kind, timezone, now, periodAt);
  const latest = (await db().query(
    `SELECT occurred_at, id FROM eve_events WHERE owner_id = $1
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [ownerId],
  )) as Row[];
  const checkpointId = `checkpoint_${randomUUID()}`;
  const eventId = `event_${randomUUID()}`;
  const results = await db().transaction((tx) => [
    tx`INSERT INTO review_checkpoints (
      id, owner_id, review_kind, local_period_key, timezone,
      period_start, period_end, last_generated_at, last_event_at, last_event_id,
      review_snapshot
    ) VALUES (
      ${checkpointId}, ${ownerId}, ${kind}, ${localPeriodKey}, ${timezone},
      ${review.periodStart}, ${review.periodEnd}, ${review.generatedAt},
      ${latest[0]?.occurred_at ?? null}, ${latest[0]?.id ?? null},
      ${JSON.stringify(review)}::jsonb
    ) ON CONFLICT (owner_id, review_kind, local_period_key) WHERE local_period_key IS NOT NULL
      DO UPDATE SET timezone = EXCLUDED.timezone,
        period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
        last_generated_at = EXCLUDED.last_generated_at,
        last_event_at = EXCLUDED.last_event_at, last_event_id = EXCLUDED.last_event_id,
        review_snapshot = EXCLUDED.review_snapshot, updated_at = now()
      RETURNING id, owner_id, review_kind, local_period_key, timezone,
        period_start::text, period_end::text, last_generated_at::text, review_snapshot`,
    tx`INSERT INTO eve_events (
      id, owner_id, type, source_type, source_id, summary, payload, delivery_classification
    ) VALUES (
      ${eventId}, ${ownerId}, ${kind === "daily" ? "DAILY_BRIEF_GENERATED" : "WEEKLY_REVIEW_GENERATED"},
      'review', ${kind}, ${kind === "daily" ? "Generated daily brief" : "Generated weekly review"},
      ${JSON.stringify({ kind, localPeriodKey, timezone, periodStart: review.periodStart, periodEnd: review.periodEnd })}::jsonb,
      'digest'
    )`,
  ]);
  const checkpoint = checkpointFrom((results[0] as unknown as Row[])[0]);
  if (checkpoint === null) throw new Error("Review checkpoint could not be persisted.");
  return { checkpoint, reused: false };
}

export async function generateProgressReview(
  ownerId: string,
  kind: ReviewKind,
  options: {
    checkpoint?: boolean;
    now?: Date;
    timezone?: string;
    periodAt?: Date;
    reuseCheckpoint?: boolean;
  } = {},
): Promise<ProgressReview> {
  const now = options.now ?? new Date();
  if (options.checkpoint) {
    const result = await generateProgressReviewCheckpoint(ownerId, kind, {
      timezone: options.timezone,
      now,
      periodAt: options.periodAt,
      reuse: options.reuseCheckpoint,
    });
    return result.checkpoint.review;
  }
  return (await computeProgressReview(
    ownerId,
    kind,
    options.timezone ?? "UTC",
    now,
    options.periodAt ?? now,
  )).review;
}
