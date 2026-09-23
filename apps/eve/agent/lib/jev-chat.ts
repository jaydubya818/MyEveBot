import { z } from "zod";
import type { ApprovalContext, ToolContext } from "eve/tools";
import { JevDecisionProvider, jevConfigured, jevMetadata } from "../../lib/decision-intelligence/jev-provider.ts";
import { knowledgeContract, knowledgeRequest, resultSchema, safeFailure } from "../../lib/decision-intelligence/contract.ts";

// Model tool schemas require an object at the root. Keep operation-specific
// validation here rather than exporting a root union to the provider.
export const jevChatInput = z.object({
  operation: z.enum(["status", "evaluate"]),
  statements: z.array(z.string().trim().min(1).max(2000)).min(1).max(5).optional(),
}).strict().superRefine((input, ctx) => {
  if ((input.operation === "evaluate") !== Boolean(input.statements)) {
    ctx.addIssue({ code: "custom", message: "evaluate requires statements; status takes no statements." });
  }
});
type Input = z.infer<typeof jevChatInput>;
type Context = Pick<ToolContext, "session" | "abortSignal">;
const ownerSession = (ctx: Pick<Context, "session">) => {
  const current = ctx.session.auth.current, initiator = ctx.session.auth.initiator;
  return !ctx.session.parent && current?.principalType === "user" && current.attributes.owner === "true"
    && initiator?.principalType === "user" && initiator.attributes.owner === "true"
    && current.principalId === initiator.principalId;
};
// Reject obvious secrets before an external request; never log rejected text.
const hasSecret = (text: string) => /-----BEGIN|\bBearer\s|\b(?:sk|ghp|ghs)[-_][a-zA-Z0-9]{8,}|(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(text);
export function jevChatApproval(ctx: ApprovalContext<Input>) {
  if (!ownerSession(ctx)) return { type: "denied" as const, reason: "Jev evaluation is available only in the owner's direct conversation." };
  const input = jevChatInput.safeParse(ctx.toolInput);
  if (!input.success) return "denied" as const;
  if (input.data.operation === "evaluate" && input.data.statements!.some(hasSecret))
    return { type: "denied" as const, reason: "Do not submit credentials or secret-bearing text to Jev." };
  // Disabled/status calls only report availability; they never contact the provider.
  return input.data.operation === "evaluate" && jevConfigured() ? "user-approval" as const : "not-applicable" as const;
}
export async function evaluateWithJev(value: Input, ctx: Context) {
  if (!ownerSession(ctx)) return { status: "denied", code: "OWNER_REQUIRED", usedJev: false };
  const input = jevChatInput.parse(value);
  const metadata = { provider: jevMetadata.name, gateway: jevMetadata.gateway, model: jevMetadata.model,
    mode: "ADVISORY_ONLY", automaticKnowledgeWrites: false, contract: "knowledge.classification:v1",
    outcomes: knowledgeContract.outcomes, excluded: knowledgeContract.excluded };
  if (!jevConfigured()) return { ...metadata, status: "unavailable", usedJev: false,
    message: "Jev evaluation is not configured in this runtime. No provider call was made. Do not search for a person or peer named Jev or claim normal-model classification used Jev." };
  if (input.operation === "status") return { ...metadata, status: "configured", usedJev: false,
    message: "Configuration is present; successful provider authentication has not yet been verified. Evaluation requires approval of the exact submitted text." };
  const statements = input.statements!; // Required by the parsed evaluate operation.
  if (statements.some(hasSecret)) return { ...metadata, status: "denied", code: "PRIVACY_EXCLUDED", usedJev: false };
  const provider = new JevDecisionProvider();
  const results = [];
  for (const [index, statement] of statements.entries()) {
    if (ctx.abortSignal.aborted) break;
    try {
      const result = resultSchema.parse(await provider.evaluate(knowledgeRequest(statement), ctx.abortSignal));
      results.push({ index: index + 1, status: "evaluated", result });
    } catch (error) {
      results.push({ index: index + 1, status: "failed", code: safeFailure(error) });
      break; // No retry, fallback, or further paid calls after failure.
    }
  }
  return { ...metadata, status: results.length === statements.length && results.every(r => r.status === "evaluated") ? "evaluated" : "incomplete",
    usedJev: results.some(r => r.status === "evaluated"), results,
    requestedCount: statements.length,
    limitation: "Jev selects among six experimental classes; Insight, goals, and procedures are not supported categories. A forced choice does not establish that the text fits the taxonomy. Confidence is selected-class probability, not verified correctness. Jev supplies no explanation; any interpretation you add must be labeled as your own. Results cannot save Knowledge, grant authority, or trigger actions." };
}
