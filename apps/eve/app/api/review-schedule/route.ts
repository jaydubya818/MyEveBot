import { apiError, requireDatabase } from "@/lib/api-errors";
import { availableReviewDeliveryChannels } from "@/lib/review-delivery";
import { getReviewDeliveryPreferences, listReviewDeliveries, ReviewDeliveryPreferencesError, updateReviewDeliveryPreferences } from "@/lib/review-delivery-db";
import { DELIVERY_CHANNELS, type DeliveryChannel, type ReviewSchedulePatch } from "@/lib/review-schedule-types";
import { isValidLocalTime, isValidTimezone } from "@/lib/review-time";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null {
  return requireWebAuth(request) ?? requireDatabase(request);
}

function deliveryChannel(value: unknown): DeliveryChannel | null {
  if (typeof value !== "string") return null;
  return DELIVERY_CHANNELS.find((channel) => channel === value) ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const ownerId = webPrincipal(request)!.id;
  try {
    const [preferences, channels, deliveries] = await Promise.all([
      getReviewDeliveryPreferences(ownerId),
      availableReviewDeliveryChannels(ownerId),
      listReviewDeliveries(ownerId),
    ]);
    return Response.json({ preferences, channels, deliveries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Review schedule load failed", error);
    return apiError(request, 503, "review_schedule_unavailable", "Proactive delivery settings are temporarily unavailable.");
  }
}

function parsePatch(input: unknown): ReviewSchedulePatch | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const patch: ReviewSchedulePatch = {};
  if (body.ownerTimezone !== undefined) {
    if (typeof body.ownerTimezone !== "string" || !isValidTimezone(body.ownerTimezone)) return null;
    patch.ownerTimezone = body.ownerTimezone;
  }
  for (const key of ["dailyBriefEnabled", "weeklyReviewEnabled", "quietHoursEnabled"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return null;
      patch[key] = body[key];
    }
  }
  for (const key of ["dailyBriefTime", "weeklyReviewTime", "quietHoursStart", "quietHoursEnd"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || !isValidLocalTime(body[key])) return null;
      patch[key] = body[key];
    }
  }
  if (body.weeklyReviewDay !== undefined) {
    if (!Number.isInteger(body.weeklyReviewDay) || Number(body.weeklyReviewDay) < 0 || Number(body.weeklyReviewDay) > 6) return null;
    patch.weeklyReviewDay = Number(body.weeklyReviewDay);
  }
  if (body.preferredDeliveryChannel !== undefined) {
    const channel = deliveryChannel(body.preferredDeliveryChannel);
    if (channel === null) return null;
    patch.preferredDeliveryChannel = channel;
  }
  if (body.maxProactivePushesPerDay !== undefined) {
    if (!Number.isInteger(body.maxProactivePushesPerDay) || Number(body.maxProactivePushesPerDay) < 0 || Number(body.maxProactivePushesPerDay) > 20) return null;
    patch.maxProactivePushesPerDay = Number(body.maxProactivePushesPerDay);
  }
  return patch;
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const patch = parsePatch(await request.json().catch(() => null));
  if (patch === null) return apiError(request, 400, "invalid_review_schedule", "Check the timezone, times, day, and delivery settings.");
  const ownerId = webPrincipal(request)!.id;
  try {
    const [channels, current] = await Promise.all([
      availableReviewDeliveryChannels(ownerId),
      getReviewDeliveryPreferences(ownerId),
    ]);
    if (
      patch.preferredDeliveryChannel &&
      patch.preferredDeliveryChannel !== current.preferredDeliveryChannel
    ) {
      const selected = channels.find((item) => item.channel === patch.preferredDeliveryChannel);
      if (!selected?.available) {
        return apiError(request, 409, "delivery_channel_unavailable", selected?.reason ?? "That delivery channel is unavailable.");
      }
    }
    const preferences = await updateReviewDeliveryPreferences(ownerId, patch);
    return Response.json({ preferences, channels, deliveries: await listReviewDeliveries(ownerId) });
  } catch (error) {
    if (error instanceof ReviewDeliveryPreferencesError) {
      return apiError(request, 400, "review_schedule_invalid", error.message);
    }
    console.error("Review schedule update failed", error);
    return apiError(request, 503, "review_schedule_unavailable", "Proactive delivery settings are temporarily unavailable.");
  }
}
