import {blockExternalWrite,UnqualifiedExternalWrite} from "./external-write-policy.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { pushAvailability, sendPushToOwner } from "./push-db.ts";
import {
  attachReviewCheckpoint,
  claimDueReviewDeliveries,
  completeReviewDelivery,
  deliveredPushCount,
  enqueueDueReviewDeliveries,
  failReviewDelivery,
  getReviewDeliveryPreferences,
  type ClaimedReviewDelivery,
} from "./review-delivery-db.ts";
import type { DeliveryChannelAvailability, DeliveryFailureCategory } from "./review-schedule-types.ts";
import { reviewPeriod } from "./review-time.ts";
import { generateProgressReviewCheckpoint } from "./reviews.ts";
import type { ProgressReview } from "./review-types.ts";

interface DeliveryFailure {
  category: DeliveryFailureCategory;
  code: string;
  summary: string;
}

export function resolveReviewDeliveryChannel(
  requestedChannel: ClaimedReviewDelivery["requestedChannel"],
  channels: readonly DeliveryChannelAvailability[],
): { channel: ClaimedReviewDelivery["channel"]; available: boolean; reason: string | null } {
  const requested = channels.find((item) => item.channel === requestedChannel);
  return requested?.available
    ? { channel: requestedChannel, available: true, reason: null }
    : {
        channel: "in_app",
        available: false,
        reason: requested?.reason ?? "The selected channel is unavailable; the review remains in MyEve.",
      };
}

function telegramTarget(ownerId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const chatId = env.TELEGRAM_PROACTIVE_CHAT_ID?.trim();
  const configuredOwnerId = env.MYEVE_OWNER_ID?.trim() || env.SOFIE_OWNER_ID?.trim() || "owner";
  const allowedUserIds = (env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    ownerId !== configuredOwnerId ||
    !chatId ||
    !env.TELEGRAM_BOT_TOKEN?.trim() ||
    !allowedUserIds.includes(chatId)
  ) return null;
  return chatId;
}

export async function availableReviewDeliveryChannels(
  ownerId: string,
): Promise<DeliveryChannelAvailability[]> {
  const push = await pushAvailability(ownerId).catch(() => ({
    available: false,
    reason: "Web Push availability could not be checked.",
  }));
  const telegramAvailable = telegramTarget(ownerId) !== null;
  return [
    { channel: "in_app", available: true, reason: null },
    { channel: "push", ...push },
    {
      channel: "telegram",
      available: telegramAvailable,
      reason: telegramAvailable
        ? null
        : "Telegram needs a bot token and an allowlisted proactive chat target.",
    },
  ];
}

function reviewSummary(review: ProgressReview): string {
  if (review.kind === "daily") {
    const priorities = review.recommendations.length;
    return `${priorities} ${priorities === 1 ? "priority" : "priorities"} · ${review.blocked.length} ${review.blocked.length === 1 ? "blocker" : "blockers"} · ${review.pendingOwnerActions.length} waiting on you`;
  }
  const progress = review.proposedPriorities.length;
  return `${progress} proposed ${progress === 1 ? "priority" : "priorities"} · ${review.blockers.length} ${review.blockers.length === 1 ? "blocker" : "blockers"} · ${review.outcomes.length} ${review.outcomes.length === 1 ? "outcome" : "outcomes"}`;
}

async function sendTelegramReview(ownerId: string, review: ProgressReview): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = telegramTarget(ownerId);
  if (!token || !chatId) throw new Error("telegram_not_configured");
  const label = review.kind === "daily" ? "Daily Brief" : "Weekly Review";
  blockExternalWrite("telegram.legacy_review");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      chat_id: chatId,
      text: `${label} is ready.\n${reviewSummary(review)}\n\nOpen MyEve: ${publicReviewUrl(review.kind)}`,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Telegram review delivery failed", response.status, body.slice(0, 300));
    if (response.status === 401 || response.status === 403) throw new Error("telegram_authorization_failed");
    if (response.status === 400) throw new Error("telegram_invalid_destination");
    throw new Error(response.status >= 500 || response.status === 429 ? "telegram_transient" : "telegram_provider_failed");
  }
}

function publicReviewUrl(kind: ProgressReview["kind"]): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const host = configured || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return `${host}/review?kind=${kind}`;
}

function classifyFailure(error: unknown): DeliveryFailure {
  if(error instanceof UnqualifiedExternalWrite)return {category:"authorization",code:error.code,summary:error.message};
  const message = error instanceof Error ? error.message : "unknown";
  if (message.includes("not_configured")) {
    return { category: "configuration", code: message, summary: "The selected delivery channel is not configured." };
  }
  if (message.includes("destination")) {
    return { category: "invalid_destination", code: message, summary: "The selected delivery destination is unavailable." };
  }
  if (message.includes("authorization")) {
    return { category: "authorization", code: message, summary: "The delivery provider rejected authorization." };
  }
  if (message.includes("transient")) {
    return { category: "transient", code: message, summary: "The provider is temporarily unavailable." };
  }
  if (message.includes("provider")) {
    return { category: "provider", code: message, summary: "The provider could not deliver the notification." };
  }
  return { category: "unknown", code: "delivery_unknown", summary: "Delivery failed for an unknown reason." };
}

async function recordDeliveryEvent(
  delivery: ClaimedReviewDelivery,
  type: "REVIEW_DELIVERED" | "REVIEW_DELIVERY_FAILED" | "REVIEW_DELIVERY_SKIPPED",
  summary: string,
): Promise<void> {
  await db().query(
    `INSERT INTO eve_events (
       id, owner_id, type, source_type, source_id, summary, payload, delivery_classification
     ) VALUES ($1,$2,$3,'review_delivery',$4,$5,$6::jsonb,$7)`,
    [
      `event_${crypto.randomUUID()}`, delivery.ownerId, type, delivery.id, summary,
      JSON.stringify({ kind: delivery.reviewKind, channel: delivery.channel, attemptCount: delivery.attemptCount }),
      type === "REVIEW_DELIVERY_FAILED" ? "activity" : "silent",
    ],
  );
}

async function deliverOne(delivery: ClaimedReviewDelivery, now: Date): Promise<void> {
  const preferences = await getReviewDeliveryPreferences(delivery.ownerId);
  const generated = await generateProgressReviewCheckpoint(delivery.ownerId, delivery.reviewKind, {
    timezone: preferences.ownerTimezone,
    now,
    periodAt: new Date(delivery.scheduledFor),
    reuse: true,
  });
  await attachReviewCheckpoint(delivery.id, generated.checkpoint.id);
  const channels = await availableReviewDeliveryChannels(delivery.ownerId);
  const route = resolveReviewDeliveryChannel(delivery.requestedChannel, channels);
  if (!route.available) {
    await completeReviewDelivery(delivery, {
      status: "skipped",
      channel: "in_app",
      failureCategory: "configuration",
      failureCode: `${delivery.requestedChannel}_unavailable`,
      failureSummary: route.reason ?? "The selected channel is unavailable; the review remains in MyEve.",
    }, now);
    await recordDeliveryEvent(delivery, "REVIEW_DELIVERY_SKIPPED", "External review delivery was skipped; the checkpoint remains available.");
    return;
  }
  if (delivery.requestedChannel === "in_app") {
    await completeReviewDelivery(delivery, { status: "delivered", channel: "in_app" }, now);
    await recordDeliveryEvent(delivery, "REVIEW_DELIVERED", "Review checkpoint is available in MyEve.");
    return;
  }
  if (delivery.requestedChannel === "push") {
    const daily = reviewPeriod("daily", preferences.ownerTimezone, now);
    const used = await deliveredPushCount(delivery.ownerId, daily.start, daily.end);
    if (used >= preferences.maxProactivePushesPerDay) {
      await completeReviewDelivery(delivery, {
        status: "skipped",
        channel: "in_app",
        failureCategory: "configuration",
        failureCode: "push_budget_exhausted",
        failureSummary: "Daily proactive push budget reached; the review remains in MyEve.",
      }, now);
      await recordDeliveryEvent(delivery, "REVIEW_DELIVERY_SKIPPED", "Review push was skipped by the interruption budget.");
      return;
    }
    await sendPushToOwner(delivery.ownerId, {
      title: `Your ${generated.checkpoint.kind === "daily" ? "Daily Brief" : "Weekly Review"} is ready`,
      body: reviewSummary(generated.checkpoint.review),
      url: publicReviewUrl(generated.checkpoint.kind),
    });
  } else {
    await sendTelegramReview(delivery.ownerId, generated.checkpoint.review);
  }
  await completeReviewDelivery(delivery, { status: "delivered" }, now);
  await recordDeliveryEvent(delivery, "REVIEW_DELIVERED", `Review delivered through ${delivery.requestedChannel}.`);
}

export async function runReviewDeliveryTick(now = new Date()): Promise<{
  enqueued: number;
  claimed: number;
  delivered: number;
  failed: number;
}> {
  const enqueued = await enqueueDueReviewDeliveries(now);
  const due = await claimDueReviewDeliveries(now);
  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    try {
      await deliverOne(delivery, now);
      delivered += 1;
    } catch (error) {
      const failure = classifyFailure(error);
      await failReviewDelivery(delivery, failure, now);
      await recordDeliveryEvent(delivery, "REVIEW_DELIVERY_FAILED", failure.summary).catch(() => undefined);
      failed += 1;
    }
  }
  console.info("review_delivery_tick", { enqueued, claimed: due.length, delivered, failed });
  return { enqueued, claimed: due.length, delivered, failed };
}

export const reviewDeliveryPolicy = {
  classifyFailure,
  reviewSummary,
  telegramTarget,
};
