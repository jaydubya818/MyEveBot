import { z } from "zod";
import {
  contextPackageSchema,
  contextProblems,
  digitalWorkContractSchema,
  executionRouteSchema,
  scopeSchema,
  type ExecutionRoute,
} from "./contracts.ts";

const gateSchema = z.enum(["ALLOW", "DENY", "UNKNOWN"]);
const availabilitySchema = z.enum(["QUALIFIED", "UNQUALIFIED", "UNKNOWN"]);
const productiveRouteSchema = z.enum(["DIRECT", "EXECUTOR", "FACTORY", "PEER"]);
const referenceSchema = z.string().trim().min(1).max(400);
const dispatchOperation = { EXECUTOR: "executor.start", FACTORY: "factory.submit", PEER: "peer.request" } as const;

export const routeRequestSchema = z.object({
  route: executionRouteSchema,
  requiredOperations: z.array(referenceSchema).max(30),
  resourceRefs: z.array(referenceSchema).max(30),
}).strict();

/** The caller must obtain these facts from trusted current policy and provider reads. */
export const routeFactsSchema = z.object({
  currentWorkVersion: z.number().int().positive(),
  currentPolicyVersion: z.number().int().positive(),
  workActive: z.boolean(),
  scope: scopeSchema,
  agentId: referenceSchema,
  authority: gateSchema,
  remainingBudgetUsd: z.number().finite().nonnegative(),
  allowedRoutes: z.array(productiveRouteSchema).max(4),
  allowedOperations: z.array(referenceSchema).max(30),
  allowedResourceRefs: z.array(referenceSchema).max(30),
  availability: z.object({
    DIRECT: availabilitySchema,
    EXECUTOR: availabilitySchema,
    FACTORY: availabilitySchema,
    PEER: availabilitySchema,
  }).strict(),
  factoryAdmission: gateSchema,
  relayGrant: gateSchema,
  peerPolicy: gateSchema,
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type RouteFacts = z.infer<typeof routeFactsSchema>;

export interface RouteDecision {
  requested: ExecutionRoute | null;
  selected: ExecutionRoute;
  admitted: boolean;
  reasons: string[];
}

/** Selects a route only. Every eventual tool, provider and publication action must recheck authority. */
export function decideExecutionRoute(
  workInput: unknown,
  contextInput: unknown,
  requestInput: unknown,
  factsInput: unknown,
  now = Date.now(),
): RouteDecision {
  const work = digitalWorkContractSchema.safeParse(workInput);
  const context = contextPackageSchema.safeParse(contextInput);
  const request = routeRequestSchema.safeParse(requestInput);
  const facts = routeFactsSchema.safeParse(factsInput);
  if (!work.success || !context.success || !request.success || !facts.success)
    return { requested: request.success ? request.data.route : null, selected: "HUMAN", admitted: false, reasons: ["A route input or current policy fact is invalid."] };

  const proposed = request.data.route;
  const reasons: string[] = [];
  if (facts.data.scope.kind !== work.data.scope.kind || facts.data.scope.id !== work.data.scope.id ||
      facts.data.agentId !== work.data.coordinatingAgentId)
    reasons.push("The current Agent or scope does not own this Work.");
  if (facts.data.currentWorkVersion !== work.data.workVersion) reasons.push("The Work revision changed.");
  if (Date.parse(facts.data.observedAt) > now + 5000 || now - Date.parse(facts.data.observedAt) > 60000)
    reasons.push("Current authority facts are stale or future-dated.");

  // Asking a human for a decision is not an execution permission.
  if (proposed === "HUMAN")
    return { requested: proposed, selected: "HUMAN", admitted: reasons.length === 0, reasons };

  if (!facts.data.workActive) reasons.push("Work is not active.");
  if (facts.data.currentPolicyVersion !== work.data.policyVersion) reasons.push("The policy version changed.");
  if (Date.parse(work.data.deadline) <= now) reasons.push("Work authority expired.");
  if (facts.data.remainingBudgetUsd <= 0 || facts.data.remainingBudgetUsd > work.data.budgetUsd)
    reasons.push("The current budget is unavailable or inconsistent.");
  if (facts.data.authority !== "ALLOW") reasons.push("Current local authority is denied or unknown.");
  if (!work.data.allowedRoutes.includes(proposed) || !facts.data.allowedRoutes.includes(proposed))
    reasons.push("The proposed route is outside current Work or policy authority.");
  if (facts.data.availability[proposed] !== "QUALIFIED") reasons.push("The route is not currently qualified.");
  if (!request.data.requiredOperations.length || !request.data.resourceRefs.length)
    reasons.push("A productive route needs explicit operations and resource references.");
  if (proposed !== "DIRECT" && !request.data.requiredOperations.includes(dispatchOperation[proposed]))
    reasons.push(`Route ${proposed} needs its dispatch operation in the request.`);
  for (const operation of request.data.requiredOperations)
    if (!work.data.allowedOperations.includes(operation) || !facts.data.allowedOperations.includes(operation))
      reasons.push(`Operation ${operation} is outside current authority.`);
  for (const resource of request.data.resourceRefs)
    if (!work.data.resourceRefs.includes(resource) || !facts.data.allowedResourceRefs.includes(resource))
      reasons.push(`Resource ${resource} is outside current authority.`);
  reasons.push(...contextProblems(work.data, context.data, now));
  if (proposed === "FACTORY" && facts.data.factoryAdmission !== "ALLOW")
    reasons.push("MyFactory admission is denied or unknown.");
  if (proposed === "PEER" && (facts.data.relayGrant !== "ALLOW" || facts.data.peerPolicy !== "ALLOW"))
    reasons.push("Relay grant and peer policy must both currently permit the request.");

  return { requested: proposed, selected: reasons.length ? "HUMAN" : proposed, admitted: reasons.length === 0, reasons };
}
