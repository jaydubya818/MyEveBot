import type { ProgressReview, ReviewKind } from "./review-types.ts";

export const DELIVERY_CHANNELS = ["in_app", "push", "telegram"] as const;
export const DELIVERY_STATUSES = [
  "scheduled",
  "deferred",
  "delivering",
  "delivered",
  "failed",
  "cancelled",
  "skipped",
] as const;
export const DELIVERY_FAILURE_CATEGORIES = [
  "transient",
  "configuration",
  "authorization",
  "provider",
  "invalid_destination",
  "unknown",
] as const;

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type DeliveryFailureCategory = (typeof DELIVERY_FAILURE_CATEGORIES)[number];

export interface ReviewDeliveryPreferences {
  ownerId: string;
  ownerTimezone: string;
  dailyBriefEnabled: boolean;
  dailyBriefTime: string;
  weeklyReviewEnabled: boolean;
  weeklyReviewDay: number;
  weeklyReviewTime: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  preferredDeliveryChannel: DeliveryChannel;
  maxProactivePushesPerDay: number;
  dailyNextAt: string | null;
  weeklyNextAt: string | null;
  updatedAt: string;
}

export interface ReviewCheckpoint {
  id: string;
  ownerId: string;
  kind: ReviewKind;
  localPeriodKey: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  review: ProgressReview;
}

export interface ReviewDeliveryView {
  id: string;
  reviewKind: ReviewKind;
  checkpointId: string | null;
  localPeriodKey: string;
  scheduledFor: string;
  attemptedAt: string | null;
  deliveredAt: string | null;
  requestedChannel: DeliveryChannel;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attemptCount: number;
  deduplicationHits: number;
  failureCategory: DeliveryFailureCategory | null;
  failureCode: string | null;
  failureSummary: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryChannelAvailability {
  channel: DeliveryChannel;
  available: boolean;
  reason: string | null;
}

export interface ReviewScheduleState {
  preferences: ReviewDeliveryPreferences;
  channels: DeliveryChannelAvailability[];
  deliveries: ReviewDeliveryView[];
}

export interface ReviewSchedulePatch {
  ownerTimezone?: string;
  dailyBriefEnabled?: boolean;
  dailyBriefTime?: string;
  weeklyReviewEnabled?: boolean;
  weeklyReviewDay?: number;
  weeklyReviewTime?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  preferredDeliveryChannel?: DeliveryChannel;
  maxProactivePushesPerDay?: number;
}
