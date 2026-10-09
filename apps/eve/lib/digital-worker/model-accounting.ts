import { z } from "zod";
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const journeyAccountingSchema = z.object({
  currency: z.literal("USD"), unit: z.literal("microUSD"), observedAt: z.string().datetime(),
  sofieMicrousd: amount, factoryMicrousd: amount, nativeMicrousd: amount,
  settledMicrousd: amount, reservedMicrousd: amount, unknownExposureMicrousd: amount,
  coverage: z.enum(["COMPLETE", "UNSETTLED", "UNAVAILABLE"]),
  externalCharges: z.literal("NOT_REPRESENTED"),
}).strict();
export type JourneyAccounting = z.infer<typeof journeyAccountingSchema>;


export function journeyCostText(cost:JourneyAccounting){
  const usd=(n:number)=>(n/1_000_000).toFixed(6);
  return `Journey model spend: $${usd(cost.settledMicrousd)} settled (Sofie $${usd(cost.sofieMicrousd)}, Factory $${usd(cost.factoryMicrousd)}, native executor $${usd(cost.nativeMicrousd)}). Reserved/exposed $${usd(cost.reservedMicrousd)}, including UNKNOWN $${usd(cost.unknownExposureMicrousd)}. Coverage: ${cost.coverage}. Provider charges outside the model ledger and infrastructure are not represented.`;
}
