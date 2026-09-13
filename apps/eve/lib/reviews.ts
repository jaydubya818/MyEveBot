import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { buildDailyBrief, buildWeeklyReview } from "./goal-insights.ts";
import { getGoal, listGoals } from "./goals.ts";
import { listOutcomes } from "./outcomes.ts";
import type { ProgressReview, ReviewKind } from "./review-types.ts";

type Row = Record<string, unknown>;

async function canonicalGoals(ownerId: string) {
  const summaries = await listGoals(ownerId, { limit: 200 });
  return (await Promise.all(summaries.map((goal) => getGoal(ownerId, goal.id))))
    .filter((goal): goal is NonNullable<typeof goal> => goal !== null);
}

export async function generateProgressReview(
  ownerId: string,
  kind: ReviewKind,
  options: { checkpoint?: boolean; now?: Date } = {},
): Promise<ProgressReview> {
  const now = options.now ?? new Date();
  const goals = await canonicalGoals(ownerId);
  const review = kind === "daily"
    ? buildDailyBrief(goals, now)
    : buildWeeklyReview(goals, await listOutcomes(ownerId, 200), now);

  if (options.checkpoint) {
    const latest = (await db().query(
      `SELECT occurred_at, id FROM eve_events WHERE owner_id = $1
       ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [ownerId],
    )) as Row[];
    const eventId = `event_${randomUUID()}`;
    await db().transaction((tx) => [
      tx`INSERT INTO review_checkpoints (
        owner_id, review_kind, period_start, period_end, last_generated_at, last_event_at, last_event_id
      ) VALUES (
        ${ownerId}, ${kind}, ${review.periodStart}, ${review.periodEnd}, ${review.generatedAt},
        ${latest[0]?.occurred_at ?? null}, ${latest[0]?.id ?? null}
      ) ON CONFLICT (owner_id, review_kind) DO UPDATE SET
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        last_generated_at = EXCLUDED.last_generated_at,
        last_event_at = EXCLUDED.last_event_at,
        last_event_id = EXCLUDED.last_event_id,
        updated_at = now()`,
      tx`INSERT INTO eve_events (
        id, owner_id, type, source_type, source_id, summary, payload, delivery_classification
      ) VALUES (
        ${eventId}, ${ownerId}, ${kind === "daily" ? "DAILY_BRIEF_GENERATED" : "WEEKLY_REVIEW_GENERATED"},
        'review', ${kind}, ${kind === "daily" ? "Generated daily brief" : "Generated weekly review"},
        ${JSON.stringify({ kind, periodStart: review.periodStart, periodEnd: review.periodEnd })}::jsonb,
        'digest'
      )`,
    ]);
  }
  return review;
}
