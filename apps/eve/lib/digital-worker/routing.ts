import { z } from "zod";
import {
  contextPackageSchema,
  contextProblems,
  digitalWorkContractSchema,
  executionRouteSchema,
  scopeSchema,
  versionedReferenceSchema,
  type ExecutionRoute,
} from "./contracts.ts";

const gateSchema = z.enum(["ALLOW", "DENY", "UNKNOWN"]);
const qualificationStatusSchema = z.enum(["QUALIFIED", "UNQUALIFIED", "UNKNOWN"]);
const providerHealthSchema = z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN"]);
export const productiveRouteSchema = z.enum(["DIRECT", "DEEP_AGENT", "EXECUTOR", "MYFACTORY", "RELAY"]);
export type ProductiveRoute = z.infer<typeof productiveRouteSchema>;
const referenceSchema = z.string().trim().min(1).max(400);
const timestampSchema = z.string().datetime({ offset: true });
const dispatchOperation: Record<Exclude<ProductiveRoute, "DIRECT">, string> = {
  DEEP_AGENT: "deep-agent.start",
  EXECUTOR: "executor.start",
  MYFACTORY: "factory.submit",
  RELAY: "peer.request",
};

// Qualified FactoryVersion is a content digest; other providers retain numeric versions.
const factoryReferenceSchema=versionedReferenceSchema.extend({version:z.union([z.number().int().positive(),z.string().regex(/^[a-f0-9]{64}$/)])});

const routeProvidersSchema = z.object({
  DIRECT: versionedReferenceSchema.nullable(),
  DEEP_AGENT: versionedReferenceSchema.nullable(),
  EXECUTOR: versionedReferenceSchema.nullable(),
  MYFACTORY: factoryReferenceSchema.nullable(),
  RELAY: versionedReferenceSchema.nullable(),
}).strict();

/** Versioned route policy and provider bindings, separate from qualitative Work profile. */
export const routePolicySchema = z.object({
  id: referenceSchema,
  version: z.number().int().positive(),
  allowedRoutes: z.array(productiveRouteSchema).max(5).refine(routes => new Set(routes).size === routes.length),
  providers: routeProvidersSchema,
}).strict();
export type RoutePolicy = z.infer<typeof routePolicySchema>;

const providerQualificationSchema = z.object({
  provider: versionedReferenceSchema,
  scope: scopeSchema,
  status: qualificationStatusSchema,
  health: providerHealthSchema,
  evidenceRef: referenceSchema.nullable(),
  observedAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
}).strict();

const qualificationsSchema = z.object({
  DIRECT: providerQualificationSchema.nullable(),
  DEEP_AGENT: providerQualificationSchema.nullable(),
  EXECUTOR: providerQualificationSchema.nullable(),
  MYFACTORY: providerQualificationSchema.extend({provider:factoryReferenceSchema}).nullable(),
  RELAY: providerQualificationSchema.nullable(),
}).strict();

export const routeRequestSchema = z.object({
  route: executionRouteSchema,
  requiredOperations: z.array(referenceSchema).max(30),
  resourceRefs: z.array(referenceSchema).max(30),
}).strict();

/** The caller must obtain these facts from trusted current policy and provider reads. */
export const routeFactsSchema = z.object({
  currentWorkVersion: z.number().int().positive(),
  currentCriteriaVersion: z.number().int().positive(),
  currentPolicyVersion: z.number().int().positive(),
  workActive: z.boolean(),
  scope: scopeSchema,
  agentId: referenceSchema,
  authority: gateSchema,
  remainingBudgetUsd: z.number().finite().nonnegative(),
  allowedRoutes: z.array(productiveRouteSchema).max(5),
  allowedOperations: z.array(referenceSchema).max(30),
  allowedResourceRefs: z.array(referenceSchema).max(30),
  routePolicy: routePolicySchema,
  qualifications: qualificationsSchema,
  writerState: z.enum(["NONE", "ACTIVE", "UNKNOWN"]),
  factoryAdmission: gateSchema,
  relayGrant: gateSchema,
  peerPolicy: gateSchema,
  observedAt: timestampSchema,
}).strict();
export type RouteFacts = z.infer<typeof routeFactsSchema>;

export interface RouteDecision {
  requested: ExecutionRoute | null;
  selected: ExecutionRoute;
  admitted: boolean;
  reasons: string[];
}

/** Selects a route only. Dispatch must transactionally recheck authority and the writer fence. */
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
  if (facts.data.currentWorkVersion !== work.data.workVersion || facts.data.currentCriteriaVersion !== work.data.criteriaVersion)
    reasons.push("The Work or criteria revision changed.");
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
  if (facts.data.routePolicy.id !== work.data.routePolicy.id ||
      facts.data.routePolicy.version !== work.data.routePolicy.version)
    reasons.push("The route policy changed.");
  if (!facts.data.routePolicy.allowedRoutes.includes(proposed))
    reasons.push("The route policy does not allow this route.");
  if (facts.data.writerState !== "NONE")
    reasons.push("An active writer exists or current writer state is unknown.");
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

  const binding = facts.data.routePolicy.providers[proposed];
  const qualification = facts.data.qualifications[proposed];
  if (!binding || !qualification ||
      binding.id !== qualification.provider.id || binding.version !== qualification.provider.version)
    reasons.push("The route has no matching qualified provider binding.");
  else {
    if (qualification.scope.kind !== work.data.scope.kind || qualification.scope.id !== work.data.scope.id)
      reasons.push("Provider qualification is outside Work scope.");
    if (qualification.status !== "QUALIFIED" || qualification.health !== "HEALTHY" ||
        !qualification.evidenceRef || !qualification.expiresAt || Date.parse(qualification.expiresAt) <= now ||
        Date.parse(qualification.observedAt) > now + 5000 || now - Date.parse(qualification.observedAt) > 60000)
      reasons.push("The route provider is not currently healthy and qualified with source-linked evidence.");
  }
  if (proposed === "MYFACTORY" && facts.data.factoryAdmission !== "ALLOW")
    reasons.push("MyFactory admission is denied or unknown.");
  if (proposed === "RELAY" && (facts.data.relayGrant !== "ALLOW" || facts.data.peerPolicy !== "ALLOW"))
    reasons.push("Relay grant and peer policy must both currently permit the request.");

  return { requested: proposed, selected: reasons.length ? "HUMAN" : proposed, admitted: reasons.length === 0, reasons };
}
