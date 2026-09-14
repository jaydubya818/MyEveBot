import assert from "node:assert/strict";
import test from "node:test";

import { resolveReviewDeliveryChannel, reviewDeliveryPolicy } from "../lib/review-delivery.ts";
import { reviewRetryDecision } from "../lib/review-delivery-db.ts";
import {
  deliveryDeduplicationKey,
  isValidTimezone,
  mostRecentScheduledReviewAt,
  nextScheduledReviewAt,
  quietHoursEnd,
  reviewPeriod,
} from "../lib/review-time.ts";

test("review periods follow owner-local calendar boundaries across DST", () => {
  const spring = reviewPeriod("daily", "America/Los_Angeles", new Date("2026-03-08T19:00:00Z"));
  assert.equal(spring.key, "2026-03-08");
  assert.equal(spring.start.toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(spring.end.toISOString(), "2026-03-09T07:00:00.000Z");
  assert.equal(spring.end.getTime() - spring.start.getTime(), 23 * 60 * 60 * 1_000);

  const fall = reviewPeriod("daily", "America/Los_Angeles", new Date("2026-11-01T20:00:00Z"));
  assert.equal(fall.key, "2026-11-01");
  assert.equal(fall.end.getTime() - fall.start.getTime(), 25 * 60 * 60 * 1_000);
});

test("weekly periods and schedules use local weekdays", () => {
  const period = reviewPeriod("weekly", "America/New_York", new Date("2026-09-13T16:00:00Z"));
  assert.equal(period.key, "2026-W37");
  assert.equal(period.start.toISOString(), "2026-09-07T04:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-09-14T04:00:00.000Z");

  const next = nextScheduledReviewAt(
    "weekly",
    "America/Los_Angeles",
    "19:00",
    0,
    new Date("2026-09-13T12:00:00Z"),
  );
  assert.equal(next.toISOString(), "2026-09-14T02:00:00.000Z");
  assert.equal(
    mostRecentScheduledReviewAt("daily", "America/Los_Angeles", "07:00", 0, new Date("2026-09-13T18:00:00Z")).toISOString(),
    "2026-09-13T14:00:00.000Z",
  );
});

test("scheduled wall times remain single and deterministic through DST transitions", () => {
  const springForward = nextScheduledReviewAt(
    "daily",
    "America/Los_Angeles",
    "02:30",
    0,
    new Date("2026-03-08T08:00:00.000Z"),
  );
  assert.equal(springForward.toISOString(), "2026-03-08T10:30:00.000Z");

  const firstFallOccurrence = nextScheduledReviewAt(
    "daily",
    "America/Los_Angeles",
    "01:30",
    0,
    new Date("2026-11-01T07:00:00.000Z"),
  );
  assert.equal(firstFallOccurrence.toISOString(), "2026-11-01T08:30:00.000Z");
  const afterFirstFallOccurrence = nextScheduledReviewAt(
    "daily",
    "America/Los_Angeles",
    "01:30",
    0,
    new Date("2026-11-01T08:31:00.000Z"),
  );
  assert.equal(afterFirstFallOccurrence.toISOString(), "2026-11-02T09:30:00.000Z");
});

test("quiet hours defer only inside the configured local window", () => {
  const during = quietHoursEnd(
    new Date("2026-09-14T06:00:00Z"),
    "America/Los_Angeles",
    "22:00",
    "07:00",
  );
  assert.equal(during?.toISOString(), "2026-09-14T14:00:00.000Z");
  assert.equal(
    quietHoursEnd(new Date("2026-09-14T18:00:00Z"), "America/Los_Angeles", "22:00", "07:00"),
    null,
  );
});

test("timezone, deduplication, and delivery failure classification are deterministic", () => {
  assert.equal(isValidTimezone("Europe/London"), true);
  assert.equal(isValidTimezone("not/a-zone"), false);
  assert.equal(deliveryDeduplicationKey({ ownerId: "owner", kind: "daily", periodKey: "2026-09-13", channel: "push" }), "owner:daily:2026-09-13:push");
  assert.deepEqual(reviewDeliveryPolicy.classifyFailure(new Error("telegram_transient")), {
    category: "transient",
    code: "telegram_transient",
    summary: "The provider is temporarily unavailable.",
  });
  assert.equal(reviewDeliveryPolicy.classifyFailure(new Error("push_not_configured")).category, "configuration");
  assert.equal(
    resolveReviewDeliveryChannel("push", [
      { channel: "in_app", available: true, reason: null },
      { channel: "push", available: false, reason: "No browser subscription." },
    ]).channel,
    "in_app",
  );
  assert.equal(reviewRetryDecision("transient", 1, new Date("2026-09-13T12:00:00Z")).nextAttemptAt?.toISOString(), "2026-09-13T12:01:00.000Z");
  assert.equal(reviewRetryDecision("authorization", 1, new Date()).retry, false);
  assert.equal(reviewRetryDecision("transient", 3, new Date()).retry, false);
});

test("proactive Telegram requires the configured owner and an explicit allowlist", () => {
  const configured = {
    MYEVE_OWNER_ID: "owner-a",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_ALLOWED_USER_IDS: "123,456",
    TELEGRAM_PROACTIVE_CHAT_ID: "456",
  };
  assert.equal(reviewDeliveryPolicy.telegramTarget("owner-a", configured), "456");
  assert.equal(reviewDeliveryPolicy.telegramTarget("owner-b", configured), null);
  assert.equal(
    reviewDeliveryPolicy.telegramTarget("owner-a", { ...configured, TELEGRAM_ALLOWED_USER_IDS: "123" }),
    null,
  );
  assert.equal(
    reviewDeliveryPolicy.telegramTarget("owner-a", { ...configured, TELEGRAM_PROACTIVE_CHAT_ID: "" }),
    null,
  );
});
