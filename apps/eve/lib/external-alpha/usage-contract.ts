import { z } from "zod";

const amount = z.number().int().nonnegative().safe();
export const alphaChatStatusSchema = z.object({
  version: z.literal(1),
  checkedAt: z.iso.datetime({ offset: true }),
  dayIndex: amount,
  resetsAt: z.iso.datetime({ offset: true }),
  activatedAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(["active", "paused", "inactive", "expired", "revoked"]),
  dailyTurnsUsed: amount,
  dailyReservedMicrousd: amount,
  trialReservedMicrousd: amount,
  quotaRemaining: amount.max(10),
  limits: z.object({
    dailyTurns: z.literal(10), perTurnMicrousd: z.literal(100_000),
    dailyMicrousd: z.literal(1_000_000), trialMicrousd: z.literal(5_000_000),
    sharedDailyMicrousd: z.literal(2_000_000), sharedTrialMicrousd: z.literal(10_000_000),
  }).strict(),
}).strict();
export const alphaChatUsageSchema = alphaChatStatusSchema.extend({
  measured: z.object({ dailyMicrousd: amount, trialMicrousd: amount, unsettledOperations: amount }).strict(),
  localPaused: z.boolean(),
}).strict();
export type AlphaChatUsage = z.infer<typeof alphaChatUsageSchema>;
