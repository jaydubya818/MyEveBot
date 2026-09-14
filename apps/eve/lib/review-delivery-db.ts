import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import {
  DELIVERY_CHANNELS,
  type DeliveryChannel,
  type DeliveryFailureCategory,
  type ReviewDeliveryPreferences,
  type ReviewDeliveryView,
  type ReviewSchedulePatch,
} from "./review-schedule-types.ts";
import { deliveryDeduplicationKey, isValidLocalTime, isValidTimezone, mostRecentScheduledReviewAt, nextScheduledReviewAt, quietHoursEnd, reviewPeriod } from "./review-time.ts";
import type { ReviewKind } from "./review-types.ts";

type Row = Record<string, unknown>;

const MAX_ATTEMPTS = 3;

export class ReviewDeliveryPreferencesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewDeliveryPreferencesError";
  }
}

export function reviewRetryDecision(
  category: DeliveryFailureCategory,
  attemptCount: number,
  now: Date,
): { retry: boolean; nextAttemptAt: Date | null } {
  const retryable = category === "transient" || category === "provider" || category === "unknown";
  const retry = retryable && attemptCount < MAX_ATTEMPTS;
  const backoffMinutes = attemptCount === 1 ? 1 : 5;
  return {
    retry,
    nextAttemptAt: retry ? new Date(now.getTime() + backoffMinutes * 60_000) : null,
  };
}

export interface ClaimedReviewDelivery extends ReviewDeliveryView {
  ownerId: string;
  deliveryClassification: "digest" | "push" | "urgent";
}

function text(value: unknown): string {
  return String(value);
}

function timeText(value: unknown): string {
  return text(value).slice(0, 5);
}

function isoText(value: unknown): string {
  const date = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(date.getTime())) throw new Error("Review delivery timestamp is invalid.");
  return date.toISOString();
}

function nullableIsoText(value: unknown): string | null {
  return value === null || value === undefined ? null : isoText(value);
}

function mapPreferences(row: Row): ReviewDeliveryPreferences {
  return {
    ownerId: text(row.owner_id),
    ownerTimezone: text(row.owner_timezone),
    dailyBriefEnabled: Boolean(row.daily_brief_enabled),
    dailyBriefTime: timeText(row.daily_brief_time),
    weeklyReviewEnabled: Boolean(row.weekly_review_enabled),
    weeklyReviewDay: Number(row.weekly_review_day),
    weeklyReviewTime: timeText(row.weekly_review_time),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: timeText(row.quiet_hours_start),
    quietHoursEnd: timeText(row.quiet_hours_end),
    preferredDeliveryChannel: text(row.preferred_delivery_channel) as DeliveryChannel,
    maxProactivePushesPerDay: Number(row.max_proactive_pushes_per_day),
    dailyNextAt: nullableIsoText(row.daily_next_at),
    weeklyNextAt: nullableIsoText(row.weekly_next_at),
    updatedAt: isoText(row.updated_at),
  };
}

function defaultTimezone(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OWNER_TIMEZONE?.trim();
  return configured && isValidTimezone(configured) ? configured : "UTC";
}

export function defaultReviewDeliveryPreferences(ownerId: string): ReviewDeliveryPreferences {
  return {
    ownerId,
    ownerTimezone: defaultTimezone(),
    dailyBriefEnabled: false,
    dailyBriefTime: "07:00",
    weeklyReviewEnabled: false,
    weeklyReviewDay: 0,
    weeklyReviewTime: "19:00",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    preferredDeliveryChannel: "in_app",
    maxProactivePushesPerDay: 2,
    dailyNextAt: null,
    weeklyNextAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getReviewDeliveryPreferences(ownerId: string): Promise<ReviewDeliveryPreferences> {
  const rows = await db().query(
    `SELECT *, daily_brief_time::text, weekly_review_time::text,
            quiet_hours_start::text, quiet_hours_end::text,
            daily_next_at::text, weekly_next_at::text, updated_at::text
     FROM review_delivery_preferences WHERE owner_id = $1`,
    [ownerId],
  ) as Row[];
  return rows[0] ? mapPreferences(rows[0]) : defaultReviewDeliveryPreferences(ownerId);
}

function validatePreferences(value: ReviewDeliveryPreferences): void {
  if (!isValidTimezone(value.ownerTimezone)) throw new ReviewDeliveryPreferencesError("Choose a valid IANA timezone.");
  if (!isValidLocalTime(value.dailyBriefTime) || !isValidLocalTime(value.weeklyReviewTime)) {
    throw new ReviewDeliveryPreferencesError("Review times must use 24-hour HH:MM format.");
  }
  if (!isValidLocalTime(value.quietHoursStart) || !isValidLocalTime(value.quietHoursEnd)) {
    throw new ReviewDeliveryPreferencesError("Quiet hours must use 24-hour HH:MM format.");
  }
  if (value.quietHoursEnabled && value.quietHoursStart === value.quietHoursEnd) {
    throw new ReviewDeliveryPreferencesError("Quiet-hour start and end must differ.");
  }
  if (!Number.isInteger(value.weeklyReviewDay) || value.weeklyReviewDay < 0 || value.weeklyReviewDay > 6) {
    throw new ReviewDeliveryPreferencesError("Weekly review day must be between Sunday and Saturday.");
  }
  if (!DELIVERY_CHANNELS.includes(value.preferredDeliveryChannel)) {
    throw new ReviewDeliveryPreferencesError("Choose a supported delivery channel.");
  }
  if (!Number.isInteger(value.maxProactivePushesPerDay) || value.maxProactivePushesPerDay < 0 || value.maxProactivePushesPerDay > 20) {
    throw new ReviewDeliveryPreferencesError("Daily push budget must be between 0 and 20.");
  }
}

export async function updateReviewDeliveryPreferences(
  ownerId: string,
  patch: ReviewSchedulePatch,
  now = new Date(),
): Promise<ReviewDeliveryPreferences> {
  const current = await getReviewDeliveryPreferences(ownerId);
  const next: ReviewDeliveryPreferences = { ...current, ...patch, ownerId };
  validatePreferences(next);
  const dailyNext = next.dailyBriefEnabled
    ? nextScheduledReviewAt("daily", next.ownerTimezone, next.dailyBriefTime, next.weeklyReviewDay, now)
    : null;
  const weeklyNext = next.weeklyReviewEnabled
    ? nextScheduledReviewAt("weekly", next.ownerTimezone, next.weeklyReviewTime, next.weeklyReviewDay, now)
    : null;
  const rows = await db().query(
    `INSERT INTO review_delivery_preferences (
       owner_id, owner_timezone, daily_brief_enabled, daily_brief_time,
       weekly_review_enabled, weekly_review_day, weekly_review_time,
       quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
       preferred_delivery_channel, max_proactive_pushes_per_day,
       daily_next_at, weekly_next_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (owner_id) DO UPDATE SET
       owner_timezone = EXCLUDED.owner_timezone,
       daily_brief_enabled = EXCLUDED.daily_brief_enabled,
       daily_brief_time = EXCLUDED.daily_brief_time,
       weekly_review_enabled = EXCLUDED.weekly_review_enabled,
       weekly_review_day = EXCLUDED.weekly_review_day,
       weekly_review_time = EXCLUDED.weekly_review_time,
       quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       preferred_delivery_channel = EXCLUDED.preferred_delivery_channel,
       max_proactive_pushes_per_day = EXCLUDED.max_proactive_pushes_per_day,
       daily_next_at = EXCLUDED.daily_next_at,
       weekly_next_at = EXCLUDED.weekly_next_at,
       updated_at = now()
     RETURNING *, daily_brief_time::text, weekly_review_time::text,
       quiet_hours_start::text, quiet_hours_end::text,
       daily_next_at::text, weekly_next_at::text, updated_at::text`,
    [
      ownerId, next.ownerTimezone, next.dailyBriefEnabled, next.dailyBriefTime,
      next.weeklyReviewEnabled, next.weeklyReviewDay, next.weeklyReviewTime,
      next.quietHoursEnabled, next.quietHoursStart, next.quietHoursEnd,
      next.preferredDeliveryChannel, next.maxProactivePushesPerDay,
      dailyNext?.toISOString() ?? null, weeklyNext?.toISOString() ?? null,
    ],
  ) as Row[];
  return mapPreferences(rows[0]);
}

function mapDelivery(row: Row): ReviewDeliveryView {
  return {
    id: text(row.id),
    reviewKind: text(row.review_kind) as ReviewKind,
    checkpointId: row.checkpoint_id === null ? null : text(row.checkpoint_id),
    localPeriodKey: text(row.local_period_key),
    scheduledFor: isoText(row.scheduled_for),
    attemptedAt: nullableIsoText(row.attempted_at),
    deliveredAt: nullableIsoText(row.delivered_at),
    requestedChannel: text(row.requested_channel) as DeliveryChannel,
    channel: text(row.channel) as DeliveryChannel,
    status: text(row.status) as ReviewDeliveryView["status"],
    attemptCount: Number(row.attempt_count),
    deduplicationHits: Number(row.deduplication_hits),
    failureCategory: row.failure_category === null ? null : text(row.failure_category) as DeliveryFailureCategory,
    failureCode: row.failure_code === null ? null : text(row.failure_code),
    failureSummary: row.failure_summary === null ? null : text(row.failure_summary),
    nextAttemptAt: nullableIsoText(row.next_attempt_at),
    createdAt: isoText(row.created_at),
    updatedAt: isoText(row.updated_at),
  };
}

const DELIVERY_PROJECTION = `
  id, owner_id, review_kind, checkpoint_id, local_period_key,
  scheduled_for::text, attempted_at::text, delivered_at::text,
  requested_channel, channel, delivery_classification, status,
  attempt_count, deduplication_hits, failure_category, failure_code,
  failure_summary, next_attempt_at::text, created_at::text, updated_at::text
`;

export async function listReviewDeliveries(ownerId: string, limit = 30): Promise<ReviewDeliveryView[]> {
  const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 30;
  const rows = await db().query(
    `SELECT ${DELIVERY_PROJECTION} FROM review_deliveries
     WHERE owner_id = $1 ORDER BY scheduled_for DESC, id DESC LIMIT $2`,
    [ownerId, bounded],
  ) as Row[];
  return rows.map(mapDelivery);
}

async function enqueueKind(
  preferences: ReviewDeliveryPreferences,
  kind: ReviewKind,
  scheduledFor: Date,
  expectedNextAt: Date,
): Promise<void> {
  const period = reviewPeriod(kind, preferences.ownerTimezone, scheduledFor);
  const deduplicationKey = deliveryDeduplicationKey({
    ownerId: preferences.ownerId,
    kind,
    periodKey: period.key,
    channel: preferences.preferredDeliveryChannel,
  });
  const deliveryClassification = preferences.preferredDeliveryChannel === "in_app" ? "digest" : "push";
  const quietEnd = preferences.quietHoursEnabled
    ? quietHoursEnd(scheduledFor, preferences.ownerTimezone, preferences.quietHoursStart, preferences.quietHoursEnd)
    : null;
  const status = quietEnd === null ? "scheduled" : "deferred";
  await db().query(
    `INSERT INTO review_deliveries (
       id, owner_id, review_kind, local_period_key, scheduled_for,
       requested_channel, channel, delivery_classification, status,
       deduplication_key, next_attempt_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10)
     ON CONFLICT (deduplication_key) DO UPDATE SET
       deduplication_hits = review_deliveries.deduplication_hits + 1,
       updated_at = now()`,
    [
      `delivery_${randomUUID()}`, preferences.ownerId, kind, period.key,
      scheduledFor.toISOString(), preferences.preferredDeliveryChannel, deliveryClassification,
      status, deduplicationKey, (quietEnd ?? scheduledFor).toISOString(),
    ],
  );
  const nextAt = nextScheduledReviewAt(
    kind,
    preferences.ownerTimezone,
    kind === "daily" ? preferences.dailyBriefTime : preferences.weeklyReviewTime,
    preferences.weeklyReviewDay,
    scheduledFor,
  );
  const column = kind === "daily" ? "daily_next_at" : "weekly_next_at";
  await db().query(
    `UPDATE review_delivery_preferences SET ${column} = $1, updated_at = now()
     WHERE owner_id = $2 AND ${column} = $3`,
    [nextAt.toISOString(), preferences.ownerId, expectedNextAt.toISOString()],
  );
}

export async function enqueueDueReviewDeliveries(now = new Date(), limit = 50): Promise<number> {
  const rows = await db().query(
    `SELECT *, daily_brief_time::text, weekly_review_time::text,
       quiet_hours_start::text, quiet_hours_end::text,
       daily_next_at::text, weekly_next_at::text, updated_at::text
     FROM review_delivery_preferences
     WHERE (daily_brief_enabled AND daily_next_at <= $1)
        OR (weekly_review_enabled AND weekly_next_at <= $1)
     ORDER BY LEAST(COALESCE(daily_next_at, 'infinity'), COALESCE(weekly_next_at, 'infinity'))
     LIMIT $2`,
    [now.toISOString(), Math.max(1, Math.min(limit, 200))],
  ) as Row[];
  let enqueued = 0;
  for (const row of rows) {
    const preferences = mapPreferences(row);
    if (preferences.dailyBriefEnabled && preferences.dailyNextAt && new Date(preferences.dailyNextAt) <= now) {
      await enqueueKind(
        preferences,
        "daily",
        mostRecentScheduledReviewAt("daily", preferences.ownerTimezone, preferences.dailyBriefTime, preferences.weeklyReviewDay, now),
        new Date(preferences.dailyNextAt),
      );
      enqueued += 1;
    }
    if (preferences.weeklyReviewEnabled && preferences.weeklyNextAt && new Date(preferences.weeklyNextAt) <= now) {
      await enqueueKind(
        preferences,
        "weekly",
        mostRecentScheduledReviewAt("weekly", preferences.ownerTimezone, preferences.weeklyReviewTime, preferences.weeklyReviewDay, now),
        new Date(preferences.weeklyNextAt),
      );
      enqueued += 1;
    }
  }
  return enqueued;
}

export async function claimDueReviewDeliveries(now = new Date(), limit = 20): Promise<ClaimedReviewDelivery[]> {
  const rows = await db().query(
    `WITH candidates AS (
       SELECT id, status, attempt_count FROM review_deliveries
       WHERE attempt_count < $1
         AND (
           (status IN ('scheduled', 'deferred') AND COALESCE(next_attempt_at, scheduled_for) <= $2)
           OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= $2)
           OR (status = 'delivering' AND claimed_until < $2)
         )
       ORDER BY COALESCE(next_attempt_at, scheduled_for), id
       FOR UPDATE SKIP LOCKED
       LIMIT $3
     ), expired_attempts AS (
       UPDATE review_delivery_attempts attempt SET
         status = 'failed', finished_at = $2, failure_category = 'unknown',
         failure_code = 'delivery_lease_expired',
         failure_summary = 'The prior delivery attempt ended before completion.'
       FROM candidates
       WHERE candidates.status = 'delivering'
         AND attempt.delivery_id = candidates.id
         AND attempt.attempt_number = candidates.attempt_count
         AND attempt.status = 'delivering'
       RETURNING attempt.delivery_id
     ), claimed AS (
       UPDATE review_deliveries delivery SET
         status = 'delivering',
         attempted_at = $2,
         attempt_count = delivery.attempt_count + 1,
         claimed_until = $2::timestamptz + interval '5 minutes',
         updated_at = $2
       FROM candidates WHERE delivery.id = candidates.id
       RETURNING delivery.*
     ), attempts AS (
       INSERT INTO review_delivery_attempts (delivery_id, attempt_number, status, attempted_at)
       SELECT id, attempt_count, 'delivering', $2 FROM claimed
       ON CONFLICT (delivery_id, attempt_number) DO NOTHING
       RETURNING delivery_id
     )
     SELECT * FROM claimed`,
    [MAX_ATTEMPTS, now.toISOString(), Math.max(1, Math.min(limit, 100))],
  ) as Row[];
  return rows.map((row) => ({
    ...mapDelivery(row),
    ownerId: text(row.owner_id),
    deliveryClassification: text(row.delivery_classification) as ClaimedReviewDelivery["deliveryClassification"],
  }));
}

export async function attachReviewCheckpoint(deliveryId: string, checkpointId: string): Promise<void> {
  await db().query(
    `UPDATE review_deliveries SET checkpoint_id = $1, updated_at = now() WHERE id = $2`,
    [checkpointId, deliveryId],
  );
}

export async function completeReviewDelivery(
  delivery: ClaimedReviewDelivery,
  input: {
    status: "delivered" | "skipped";
    channel?: DeliveryChannel;
    failureCategory?: DeliveryFailureCategory;
    failureCode?: string;
    failureSummary?: string;
  },
  now = new Date(),
): Promise<void> {
  const channel = input.channel ?? delivery.channel;
  await db().transaction((tx) => [
    tx`UPDATE review_deliveries SET
      status = ${input.status}, channel = ${channel}, delivered_at = ${now.toISOString()},
      failure_category = ${input.failureCategory ?? null}, failure_code = ${input.failureCode ?? null},
      failure_summary = ${input.failureSummary ?? null}, next_attempt_at = NULL,
      claimed_until = NULL, updated_at = ${now.toISOString()}
      WHERE id = ${delivery.id}`,
    tx`UPDATE review_delivery_attempts SET
      status = ${input.status}, finished_at = ${now.toISOString()},
      failure_category = ${input.failureCategory ?? null}, failure_code = ${input.failureCode ?? null},
      failure_summary = ${input.failureSummary ?? null}
      WHERE delivery_id = ${delivery.id} AND attempt_number = ${delivery.attemptCount}`,
  ]);
}

export async function failReviewDelivery(
  delivery: ClaimedReviewDelivery,
  failure: { category: DeliveryFailureCategory; code: string; summary: string },
  now = new Date(),
): Promise<void> {
  const { nextAttemptAt: nextAttempt } = reviewRetryDecision(failure.category, delivery.attemptCount, now);
  await db().transaction((tx) => [
    tx`UPDATE review_deliveries SET
      status = 'failed', failure_category = ${failure.category}, failure_code = ${failure.code},
      failure_summary = ${failure.summary}, next_attempt_at = ${nextAttempt?.toISOString() ?? null},
      claimed_until = NULL, updated_at = ${now.toISOString()}
      WHERE id = ${delivery.id}`,
    tx`UPDATE review_delivery_attempts SET
      status = 'failed', finished_at = ${now.toISOString()}, failure_category = ${failure.category},
      failure_code = ${failure.code}, failure_summary = ${failure.summary}
      WHERE delivery_id = ${delivery.id} AND attempt_number = ${delivery.attemptCount}`,
  ]);
}

export async function deliveredPushCount(ownerId: string, start: Date, end: Date): Promise<number> {
  const rows = await db().query(
    `SELECT count(*)::int AS count FROM review_deliveries
     WHERE owner_id = $1 AND channel = 'push' AND status = 'delivered'
       AND delivered_at >= $2 AND delivered_at < $3`,
    [ownerId, start.toISOString(), end.toISOString()],
  ) as Row[];
  return Number(rows[0]?.count ?? 0);
}
