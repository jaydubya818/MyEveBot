import type {
  CanonicalBinding,
  CanonicalContract,
} from "./canonical-adapter.ts";
import type { GoalWorkQueries } from "./projections.ts";
/** Work-scoped requests to existing Knowledge/learning interfaces. Goal text is
 * context, never a scope credential. No memory writes, learning or promotion here. */
export function goalMemoryRequest(
  binding: CanonicalBinding,
  work: CanonicalContract,
  workType: "research" | "implementation" | "review",
) {
  if (
    work.workId !== binding.workId ||
    work.scope.kind !== "personal" ||
    work.scope.id !== binding.ownerId
  )
    throw new Error("Memory Work scope mismatch");
  return {
    ownerId: binding.ownerId,
    scope: work.scope,
    workId: work.workId,
    workVersion: work.workVersion,
    knowledge: {
      method: "EngineeringKnowledgeStore.list",
      args: [work.workId, { limit: 10, includeHistory: false }],
    },
    advisoryLearning: {
      method: "LearningStore.retrieve",
      args: [work.workId, workType, `goal:${binding.correlationKey}`],
    },
    sourceRefs: binding.intent.dependencies
      .flatMap((d) => (d.evidenceRef ? [d.evidenceRef] : []))
      .slice(0, 30),
    trust: "ADVISORY_ONLY" as const,
  };
}
export function goalLearningReferences(
  goal: Awaited<ReturnType<GoalWorkQueries["goal"]>>,
  interventions: { necessaryJudgment: number; avoidableCoordination: number },
) {
  return {
    version: "myeve.goal-feedback.v1",
    goalId: goal.id,
    goalOutcome: {
      status: goal.status,
      criteria: goal.successCriteria,
      evidence: goal.completedOutcomes,
    },
    tasks: goal.tasks.map((t) => ({
      taskId: t.id,
      outcome: t.status,
      resultId: t.result?.id ?? null,
      workId: t.currentWork,
    })),
    resultRefs: goal.recentResults.map((r) => ({
      workId: r.workId,
      resultId: r.result.id,
    })),
    ownerFeedbackRefs: goal.history
      .filter((e) => e.type.startsWith("OWNER_"))
      .map((e) => ({ id: e.id, type: e.type })),
    coordinationDebt: interventions,
    planChanges: goal.planHistory.map((p) => ({
      id: p.id,
      version: p.version,
      reason: p.strategy,
    })),
    disposition: "EVIDENCE_ONLY" as const,
  };
}
