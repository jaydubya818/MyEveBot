import { defineTool } from "eve/tools";
import { z } from "zod";
import { listKnowledge } from "../../lib/knowledge.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { WorkStore } from "../../lib/engineering/store.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";
import { assertEngineeringKnowledgeWorkBinding } from "../lib/engineering-knowledge-binding.ts";

export default defineTool({
  description: "Search canonical structured knowledge. For selected Engineering Work, pass engineeringWorkId to search repository facts with primary sources and correction history; only the authenticated selected Work is accepted. This is not conversation-memory retrieval.",
  inputSchema: z.object({ query: z.string().max(500).optional(), type: z.enum(["fact", "observation", "hypothesis", "decision", "commitment", "preference", "insight"]).optional(), status: z.string().max(40).optional(), goalId: z.string().min(1).optional(), minConfidence: z.number().min(0).max(1).optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), limit: z.number().int().min(1).max(100).default(25), engineeringWorkId: z.string().uuid().optional(), includeHistory: z.boolean().optional() }),
  async execute(input, ctx) {
    const ownerId = taskOwnerFromAuth(ctx.session.auth);
    if (ctx.session.auth.current?.attributes.myeveEngineeringWorkId && !input.engineeringWorkId)
      throw new Error("Selected Engineering Work requires engineeringWorkId for fact search.");
    if (input.engineeringWorkId) {
      if (input.type && input.type !== "fact" || input.goalId || input.minConfidence !== undefined || input.from || input.to)
        throw new Error("Engineering Work search supports facts, text, status, limit, and correction history only.");
      if (input.status && !["active", "stale", "contradicted", "superseded"].includes(input.status))
        throw new Error("Unknown Engineering Work fact status.");
      await assertEngineeringKnowledgeWorkBinding(ctx, ownerId, input.engineeringWorkId);
      const store = new EngineeringKnowledgeStore(new WorkStore({
        scopeId: ownerId, scopeKind: "personal", actorId: ownerId,
      }));
      return store.list(input.engineeringWorkId, {
        query: input.query, status: input.status as "active" | "stale" | "contradicted" | "superseded" | undefined,
        includeHistory: input.includeHistory || input.status === "superseded", limit: input.limit,
      });
    }
    if (input.includeHistory !== undefined)
      throw new Error("Correction history requires engineeringWorkId.");
    const { type, engineeringWorkId: _engineeringWorkId, includeHistory: _includeHistory, ...filters } = input;
    return listKnowledge(ownerId, { ...filters, kind: type });
  },
});
