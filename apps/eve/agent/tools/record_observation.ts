import { defineTool } from "eve/tools";
import { z } from "zod";
import { executionIdentityFromAuth,resolveExecution } from "../../lib/execution-auth.ts";
import { retainRoutineCheck } from "../../lib/routine-check.ts";
import { db } from "../lib/receipts-db.ts";
import { createKnowledge } from "../../lib/knowledge.ts";
import { currentConversationProvenance, knowledgeActor } from "../lib/knowledge-context.ts";

export default defineTool({
  description: "Record an observation. For a conditional Routine, supply routineCondition and bounded evidenceReferences to retain its check in Run history. A check cannot authorize a consequential effect.",
  inputSchema: z.object({ statement: z.string().min(1).max(20_000), confidence: z.number().min(0).max(1).default(0.7), occurrenceCount: z.number().int().min(1).default(1), firstObservedAt: z.string().datetime().nullable().optional(), lastObservedAt: z.string().datetime().nullable().optional(), goalId: z.string().min(1).nullable().optional(), routineCondition:z.enum(["met","not_met","unknown"]).optional(), evidenceReferences:z.array(z.string().min(1).max(500)).min(1).max(20).optional() }),
  async execute(input, ctx) {
    const actor = await knowledgeActor(ctx);
    if(input.routineCondition){
      const identity=executionIdentityFromAuth(ctx.session.auth);
      if(!identity)throw Error("A current Routine execution is required.");
      const claim=await resolveExecution(identity);
      if(claim.ownerId!==ctx.session.auth.current?.principalId)throw Error("Routine owner mismatch.");
      if(actor.createdById!==claim.agentId)throw Error("Routine agent mismatch.");
      return retainRoutineCheck(db(),claim,{condition:input.routineCondition,summary:input.statement,evidenceReferences:input.evidenceReferences});
    }
    const now = new Date().toISOString(); return createKnowledge({ ...actor, ...input, kind: "observation", firstObservedAt: input.firstObservedAt ?? now, lastObservedAt: input.lastObservedAt ?? now, provenance: await currentConversationProvenance(ctx, actor.ownerId) }); },
});
