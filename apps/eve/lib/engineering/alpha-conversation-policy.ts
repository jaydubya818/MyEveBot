import {z} from "zod";
import {WorkError} from "./types.ts";
/** Fixed portions of ONE $1.35 Work ceiling. Unused capacity is never borrowed. */
export const alphaConversationQualificationSchema=z.object({
  mode:z.literal("FACTORY_CONVERSATION_V1"),modelId:z.literal("openai/gpt-5.4-mini"),
  expiresAt:z.string().datetime(),evidenceRef:z.string().min(1),
  ceilingMicrousd:z.literal(300000),perCallMicrousd:z.literal(150000),maxCalls:z.literal(2),
  maxOutputTokens:z.literal(1024),factoryCeilingMicrousd:z.literal(1050000),
}).strict();
export type AlphaConversationQualification=z.infer<typeof alphaConversationQualificationSchema>;
export function assertAlphaConversationQualification(value:unknown,modelId:string) {
  const q=alphaConversationQualificationSchema.parse(value);
  if(q.modelId!==modelId || Date.parse(q.expiresAt)<=Date.now())
    throw new WorkError("conversation_qualification","Private-alpha conversation model qualification is unavailable or expired.",403);
  return q;
}
